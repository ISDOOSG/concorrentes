# Epic 7 — Histórico de Screenshots

> **MVP:** —
> **Depende de:** E3
> **Stories:** 1

## Objetivo

UI que apresenta a galeria histórica de screenshots de um competidor, permitindo comparação visual ao longo do tempo (slider antes/depois).

## Critérios de aceite (epic-level)

- [ ] Tab "Screenshots" em `/competitors/$id` renderiza grid cronológico (mais recente primeiro)
- [ ] Click em screenshot abre modal com imagem em tamanho cheio + metadados (data, snapshot_id)
- [ ] Comparador "antes/depois" com slider (Radix Slider já instalado) entre dois screenshots selecionáveis
- [ ] Lazy load das imagens (não baixar 100 PNGs de uma vez)

## Stories propostos

### E7.1 — Galeria + modal + comparador antes/depois
- Tab "Screenshots" em `/competitors/$id.tsx`
- Grid responsivo (3 cols desktop, 2 tablet, 1 mobile)
- Imagens vêm de signed URLs do Supabase Storage (TTL 1h)
- Modal com lightbox simples
- Comparador: 2 dropdowns (escolher data A e data B) + slider para revelar imagem B sobre imagem A

## Dependências técnicas

- E3 concluído (screenshots existem no Storage)
- Storage policies validando `auth.uid()` no path

## Out of scope

- Diff visual automático (highlight de áreas mudadas) — v2 (precisa de lib tipo `pixelmatch` rodando server-side ou client)
- Animação de timelapse — v2
- Anotações em screenshots — v2
