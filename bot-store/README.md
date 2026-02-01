# Brad Bot Store (v0)

Uma “loja” **local-first** para pacotes de bots/skills com:
- manifesto (manifest.json)
- permissões explícitas
- catálogo web local
- install/uninstall (sem executar scripts automaticamente)

## Comandos
```bash
cd bot-store
npm install

# CLI
npm run cli -- list
npm run cli -- info sales-forecast-bot
npm run cli -- install sales-forecast-bot
npm run cli -- installed

# Web catalog
npm run dev
# abre http://localhost:4677
```

## Estrutura
- `spec/` — especificação do package
- `packages/` — pacotes disponíveis
- `installed/` — cópia dos pacotes instalados
- `src/` — CLI + server

## Nota
Isto é v0: a parte “vendável” vem com assinatura de publisher, versioning remoto, permissões com aprovação e sandbox.
