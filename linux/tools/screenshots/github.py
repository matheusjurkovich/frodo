import json
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer


def ago(minutes):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).strftime('%Y-%m-%dT%H:%M:%SZ')


def check(name, conclusion):
    status = 'IN_PROGRESS' if conclusion is None else 'COMPLETED'
    return {'__typename': 'CheckRun', 'name': name, 'status': status, 'conclusion': conclusion}


def pr(repo, number, title, head, base, minutes, mergeable='MERGEABLE', decision='REVIEW_REQUIRED', rollup='SUCCESS',
       checks=(), author='demo', changes=None, approved=None, files=4, add=96, rem=31, comments=2):
    return {
        'number': number, 'title': title, 'url': f'https://github.com/{repo}/pull/{number}',
        'headRefName': head, 'baseRefName': base, 'author': {'login': author},
        'repository': {'nameWithOwner': repo}, 'additions': add, 'deletions': rem, 'changedFiles': files,
        'comments': {'totalCount': comments}, 'updatedAt': ago(minutes), 'mergeable': mergeable, 'reviewDecision': decision,
        'changes': {'nodes': [changes] if changes else []},
        'approved': {'nodes': [{'author': {'login': approved}}] if approved else []},
        'commits': {'nodes': [{'commit': {'statusCheckRollup': {'state': rollup, 'contexts': {'nodes': list(checks)}}}}]},
    }


MINE = [
    pr('demo/frodo', 42, 'feat: aba do GitHub na ilha', 'feat/github', 'master', 12, mergeable='CONFLICTING',
       checks=[check('build', 'SUCCESS'), check('test', 'SUCCESS')], files=14, add=640, rem=88, comments=3),
    pr('demo/flux-web', 318, 'fix: kanban perde a ordem ao arrastar', 'fix/kanban-order', 'main', 120,
       decision='CHANGES_REQUESTED', checks=[check('build', 'SUCCESS'), check('test', 'SUCCESS'), check('e2e', 'SUCCESS')],
       changes={'author': {'login': 'bia'}, 'body': 'Falta um teste para a coluna vazia, e o nome do método ficou genérico.'},
       comments=5),
    pr('demo/api', 905, 'feat: limite de requisições por conta', 'feat/rate-limit', 'main', 25, rollup='FAILURE',
       checks=[check('build', 'SUCCESS'), check('test', 'FAILURE'), check('lint', 'SUCCESS')], files=9, add=312, rem=40),
    pr('demo/frodo', 40, 'fix: pílula some em tela cheia', 'fix/fullscreen', 'master', 300, decision='APPROVED',
       checks=[check('build', 'SUCCESS'), check('test', 'SUCCESS')], approved='rafa', files=3, add=44, rem=9),
]

REVIEW = [
    pr('demo/flux-web', 321, 'feat: filtro por etiqueta', 'feat/label-filter', 'main', 40, author='rafa',
       checks=[check('build', 'SUCCESS'), check('test', 'SUCCESS')], files=5, add=154, rem=12),
    pr('demo/api', 910, 'docs: guia de autenticação', 'docs/auth', 'main', 180, author='lu', files=2, add=88, rem=3),
]


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        query = body.get('variables', {}).get('q', '')
        if 'variables' not in body:
            data = {'c0': {'ref': {'compare': {'behindBy': 3}}}}
        else:
            nodes = REVIEW if 'review-requested' in query else MINE
            data = {'viewer': {'login': 'demo'}, 'search': {'pageInfo': {'hasNextPage': False, 'endCursor': None}, 'nodes': nodes}}
        payload = json.dumps({'data': data}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


HTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
