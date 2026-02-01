# Brad Control Center (local)

Um micro “control center” local para gerir tarefas do Brad (e as tuas) sem PowerBI, sem fricção.

## O que faz
- Tasks CRUD (title, status, priority, due_date, notes)
- Vistas: Inbox / Next / Scheduled / Waiting / Done / All
- Import **idempotente** de `../INBOX.md`
- Links rápidos para ficheiros importantes
- Health page

## Requisitos
- Node.js (>= 18)

## Instalar
```bash
cd control-center
npm install
```

## Correr
Dev (auto-reload):
```bash
npm run dev
```

Prod:
```bash
npm start
```

Abre: http://localhost:4567

## Import do INBOX.md
No footer, clica **Import INBOX.md**.

## DB
Guardada em: `control-center/data/control-center.sqlite`

## Nota
Isto é local-only e minimalista (HTML server-rendered). O objetivo é velocidade e utilidade.
