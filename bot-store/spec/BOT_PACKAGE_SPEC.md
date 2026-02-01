# Bot Package Spec (v0)

Objetivo: um formato mínimo, auditável e instalável para “bots/skills” (plugins) com permissões claras.

## Estrutura do pacote

```
<package-root>/
  manifest.json
  README.md
  assets/ (opcional)
  scripts/ (opcional)
```

## manifest.json (v0)

Campos:
- `name` (string, obrigatório) — identificador (ex: `sales-forecast-bot`)
- `displayName` (string, obrigatório)
- `version` (string semver, obrigatório)
- `description` (string, obrigatório)
- `author` (string, opcional)
- `homepage` (url, opcional)
- `license` (string, opcional)
- `tags` (string[], opcional)
- `capabilities` (string[], obrigatório) — o que faz (ex: `forecasting`, `triage`, `reporting`)
- `permissions` (object, obrigatório)
  - `tools` (string[], obrigatório) — ex: `gog.gmail.read`, `message.send`
  - `files` (object, opcional)
    - `read` (string[])
    - `write` (string[])
  - `network` (object, opcional)
    - `allow` (string[]) — domínios permitidos
- `entrypoints` (object, opcional)
  - `runbook` (string) — caminho para um markdown de runbook (ex: `README.md`)
  - `commands` (array)
    - `{ "name": "...", "description": "...", "script": "scripts/foo.sh" }`

### Exemplo
```json
{
  "name": "sales-forecast-bot",
  "displayName": "Sales Forecast Bot",
  "version": "0.1.0",
  "description": "Forecasts e cenários em Excel com premissas auditáveis.",
  "tags": ["sales", "finance"],
  "capabilities": ["forecasting", "scenario-planning"],
  "permissions": {
    "tools": ["gog.sheets.read", "gog.sheets.write"],
    "files": {
      "read": ["./outputs", "./INBOX.md"],
      "write": ["./outputs"]
    },
    "network": {
      "allow": ["docs.google.com"]
    }
  },
  "entrypoints": {
    "runbook": "README.md",
    "commands": [
      {"name": "forecast", "description": "Generate forecast workbook", "script": "scripts/forecast.sh"}
    ]
  }
}
```

## Regras de segurança (v0)
- Permissões **explícitas** e exibidas ao instalar.
- Sem segredos dentro do pacote.
- “Install” não executa scripts automaticamente.

## Roadmap
- assinaturas (publisher) + verificação
- sandbox para execução
- marketplace remoto (registry) + versioning + rollback
