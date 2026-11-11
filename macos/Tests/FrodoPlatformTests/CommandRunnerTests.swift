import Foundation
import Testing

@testable import FrodoPlatform

@Suite("ProcessCommandRunner")
struct CommandRunnerTests {
    @Test("lê saída maior que o buffer do pipe")
    func readsOutputLargerThanThePipeBuffer() async {
        let result = await ProcessCommandRunner().run("/usr/bin/seq", arguments: ["1", "50000"], currentDirectory: nil)
        #expect(result?.status == 0)
        #expect(result?.output.split(separator: "\n").count == 50000)
    }

    @Test("devolve o código de saída")
    func returnsTheExitStatus() async {
        let result = await ProcessCommandRunner().run("/bin/sh", arguments: ["-c", "echo oi; exit 3"], currentDirectory: nil)
        #expect(result?.status == 3)
        #expect(result?.output == "oi\n")
    }

    @Test("roda na pasta pedida")
    func runsInTheGivenDirectory() async {
        let result = await ProcessCommandRunner().run("/bin/pwd", arguments: [], currentDirectory: "/usr")
        #expect(result?.output == "/usr\n")
    }

    @Test("executável que não existe devolve nil")
    func missingExecutableReturnsNil() async {
        #expect(await ProcessCommandRunner().run("/nao/existe", arguments: [], currentDirectory: nil) == nil)
    }

    @Test("processo que passa do tempo é encerrado e devolve nil")
    func processPastTheTimeoutIsTerminated() async {
        let started = Date()
        let result = await ProcessCommandRunner(timeout: 0.2).run("/bin/sleep", arguments: ["5"], currentDirectory: nil)
        #expect(result == nil)
        #expect(Date().timeIntervalSince(started) < 3)
    }

    @Test("cancelar a tarefa encerra o processo")
    func cancellingTheTaskTerminatesTheProcess() async {
        let started = Date()
        let task = Task { await ProcessCommandRunner(timeout: 30).run("/bin/sleep", arguments: ["5"], currentDirectory: nil) }
        try? await Task.sleep(for: .milliseconds(200))
        task.cancel()
        let result = await task.value
        #expect(result == nil)
        #expect(Date().timeIntervalSince(started) < 3)
    }
}
