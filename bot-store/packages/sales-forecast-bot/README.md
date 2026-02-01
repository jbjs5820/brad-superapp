# Sales Forecast Bot

**O que faz**
- Ajuda a montar forecasts e cenários em Excel com premissas auditáveis.

**Como usar (v0)**
- Este pacote é um *runbook* + manifest (não executa nada automaticamente).
- Instala via Bot Store e segue o runbook.

## Runbook (checklist)
1) Definir granularidade (BU/marca/linha/canal/cliente/produto)
2) Baseline (média móvel 3/6M) + sazonalidade
3) Tabela de premissas (uplift promo, elasticidade, stockouts, launches)
4) Cenários (Base/High/Low) — só mudam premissas
5) Sanity checks

## Output esperado
- Template Excel com 3 tabs: DATA / ASSUMPTIONS / OUTPUT
- Prompt pack auditável
