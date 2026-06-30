# Lightera Optical Flow Lab

Prototipo local e autocontido de um jogo Lean inspirado na linguagem visual da Lightera e adaptado para um fluxo simplificado de producao de cabos opticos.

## Como abrir

Abra `index.html` no navegador. Nao ha dependencias, build ou servidor obrigatorio.

## Objetivo

Maximizar capital e entregas de bobinas opticas em 5 rodadas. Cada rodada libera 2 decisoes:

- `Compactar conexao`: transforma o proximo trecho em fluxo unitario e reduz espera por lote.
- `Engenheira Lean`: reduz setup da Trefilacao e diminui defeitos.
- `Ativar Marketing`: aumenta demanda e receita potencial, mas aperta os prazos.
- `Desativar AGV`: libera caixa, mas so e seguro quando a rota ja esta quase toda conectada.

## Como ler a tela

Cada etapa mostra tres numeros:

- Entrada: fila aguardando processamento.
- Proc.: item em processamento.
- Saida: fila aguardando transferencia.

Trechos roxos indicam fluxo unitario. Trechos tracejados ainda dependem do AGV por lote de 5 bobinas.

## Sete desperdicios

O painel `Sete Desperdicios` mede Muda em tempo real:

- Superproducao: pedidos e WIP acima da capacidade.
- Espera: pedidos parados, bloqueios e falta de fluxo.
- Transporte: dependencia do AGV e de lote.
- Processamento extra: setup e ajustes na Trefilacao.
- Inventario: WIP acumulado entre etapas.
- Movimentacao: manuseio causado por layout disperso.
- Defeitos: bobinas reprovadas no teste optico.

O diagnostico destaca o desperdicio dominante e recomenda a proxima acao.
