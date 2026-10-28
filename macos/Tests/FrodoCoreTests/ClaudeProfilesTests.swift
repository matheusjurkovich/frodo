import Testing

@testable import FrodoCore

@Suite("perfis")
struct ClaudeProfilesTests {
    @Test("nomeia pelo diretório")
    func namesByDirectory() {
        #expect(labelForDirName(".claude") == "Claude")
        #expect(labelForDirName(".claude-work") == "Work")
        #expect(labelForDirName(".claude-my_client") == "My Client")
    }

    @Test("gera a sigla do perfil")
    func buildsProfileChip() {
        #expect(profileChip("Work Stuff") == "WS")
        #expect(profileChip("Claude") == "CL")
    }

    @Test("marca como ativo o perfil do diretório padrão")
    func marksDefaultDirectoryProfileAsActive() {
        #expect(isActiveProfile(ClaudeProfile(id: "a", label: "A", configDir: "/home/u/.claude/"), defaultConfigDir: "/home/u/.claude"))
        #expect(!isActiveProfile(ClaudeProfile(id: "b", label: "B", configDir: "/home/u/.claude-work"), defaultConfigDir: "/home/u/.claude"))
    }

    @Test("lê a lista salva ignorando lixo")
    func readsSavedListIgnoringGarbage() {
        #expect(parseProfiles(#"[{"id":"a","label":"X","configDir":"/x"},{"bad":1}]"#) == [ClaudeProfile(id: "a", label: "X", configDir: "/x")])
        #expect(parseProfiles("lixo").isEmpty)
    }

    @Test("expande o til do caminho para a pasta pessoal")
    func expandsTildeToHome() {
        #expect(expandHome("~/.claude-trabalho", home: "/home/a") == "/home/a/.claude-trabalho")
        #expect(expandHome("~", home: "/home/a") == "/home/a")
        #expect(expandHome("  /opt/claude/ ", home: "/home/a") == "/opt/claude")
        #expect(expandHome("", home: "/home/a") == "")
    }
}
