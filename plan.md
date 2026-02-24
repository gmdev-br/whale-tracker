# Plano para Duplicar a Seção da Tabela de Criptos (Criptos - Resumida)

## 1. Alterações no Arquivo HTML (`index.html`)
- Localizar a seção existente `<!-- Collapsible Aggregation Section -->` (com ID `aggSectionWrapper`).
- Duplicar toda essa estrutura em um novo bloco logo abaixo do original.
- Alterar o título da nova seção para `Criptos - Resumida`.
- Atualizar os IDs da nova seção para evitar conflitos com os originais e permitir manipulação independente via JavaScript. Exemplos de novos IDs:
  - `aggResumidaSectionWrapper`
  - `aggResumidaSectionContent`
  - `aggResumidaStatsBar`
  - `aggResumidaTable`
  - `aggResumidaTableBody`
- Ajustar os atributos `data-target` nos botões de collapse da nova seção.

## 2. Alterações no Arquivo JavaScript (`js/ui/aggregation.js`)
- Criar a lógica para processar os dados resumidos (agrupamentos maiores ou dados de moedas específicas).
- Referenciar os novos elementos do DOM criados em `index.html` (ex: `document.getElementById('aggResumidaTableBody')`).
- Criar ou ajustar funções de renderização (`renderResumidaTable` ou similar) para injetar os dados processados na nova tabela.
- Adicionar os 'event listeners' necessários caso a tabela resumida tenha controles próprios (exemplo: botões de filtro, ordenação).

## 3. Inconsistências Arquiteturais Verificadas (Chain of Thought / Cadeia de Pensamento)
- **Desempenho (Renderização):** Adicionar uma nova tabela significa que as atualizações do estado podem precisar renderizar duas tabelas (a normal e a resumida). Devemos garantir que o processo de re-renderização seja eficiente (usando "document fragments" ou virtual scroll se a tabela resumida ficar grande). O ideal no perfil "Resumida" é justamente ter menos linhas, não impactando muito.
- **Gerenciamento de Estado:** A lógica de cálculo/agregação das faixas de liquidação que hoje vai para uma tabela deverá também alimentar (com outros parâmetros possivelmente) a nova tabela resumida. Idealmente, criaremos uma função auxiliar para não sobrecarregar as rotinas principais.
- **Responsividade:** A nova tabela deve herdar as mesmas classes CSS (`agg-table`, `table-wrap`) para garantir o mesmo layout responsivo que a tabela principal já possui.

Por favor, confirme se o plano está alinhado com o esperado para eu prosseguir com a implementação!
