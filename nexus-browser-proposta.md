# NEXUS Browser --- Proposta de Produto e Roadmap

> **Status:** Documento conceitual\
> **Nome:** NEXUS (provisório; verificar disponibilidade e registro)\
> **Slogan:** *Your browser. Your workspace. Your universe.*

## 1. Visão do produto

O NEXUS é um navegador desktop para Windows, baseado em Chromium,
pensado principalmente para desenvolvedores. A proposta é reunir
navegação, organização de projetos, ferramentas técnicas e produtividade
em uma interface futurista, premium e personalizável.

A ideia não é criar apenas "mais um Chrome", mas um ambiente de trabalho
para desenvolvimento que seja visualmente marcante e útil no dia a dia.

### Posicionamento

  -----------------------------------------------------------------------
  Característica                      Definição
  ----------------------------------- -----------------------------------
  Categoria                           Navegador desktop

  Motor                               Chromium

  Plataforma inicial                  Windows 10/11 (compatibilidade a
                                      validar)

  Público                             Desenvolvedores, programadores e
                                      profissionais de tecnologia

  Personalidade                       Futurista, premium e inteligente

  Proposta principal                  Navegação + ambiente de
                                      desenvolvimento
  -----------------------------------------------------------------------

**Proposta de valor:** tudo o que um desenvolvedor precisa durante sua
navegação, organizado em um único lugar.

### Referências de experiência

-   **Arc:** organização por workspaces, abas verticais e navegação.
-   **Vivaldi:** personalização e controle da interface.
-   **Raycast:** central de comandos e produtividade por teclado.
-   **VS Code:** organização de ferramentas e experiência voltada a
    desenvolvedores.

Essas referências devem inspirar soluções, não resultar em cópias de
interface ou identidade.

------------------------------------------------------------------------

## 2. Identidade visual

### Direção estética: Dark Futuristic

A interface deve transmitir tecnologia e sofisticação sem prejudicar a
leitura ou o desempenho.

### Paleta de cores

  Uso                Cor                Hexadecimal
  ------------------ ------------------ -------------
  Background         Preto azulado      `#090B12`
  Surface            Grafite profundo   `#121725`
  Borders            Azul grafite       `#202B3D`
  Primary            Violeta elétrico   `#695CFF`
  Accent             Azul ciano         `#25D9F2`
  Texto principal    Branco suave       `#F4F5F8`
  Texto secundário   Cinza              `#9299AA`

### Tipografia

-   **Interface:** Inter.
-   **Elementos técnicos e código:** JetBrains Mono.
-   **Títulos:** Inter SemiBold.

### Princípios visuais

-   Bordas discretas e cantos levemente arredondados.
-   Transparências sutis; evitar glassmorphism excessivo.
-   Animações rápidas e suaves.
-   Ícones lineares e consistentes.
-   Iluminação discreta em elementos ativos.
-   Feedback visual claro em todas as interações.
-   Densidade visual controlada: priorizar espaço útil e legibilidade.

### Personalidade da marca

A marca deve parecer tecnológica, confiável, moderna e premium. O
símbolo precisa funcionar em tamanhos pequenos, especialmente como ícone
do aplicativo, favicon e ícone da barra de tarefas do Windows.

### Direções de logotipo a explorar

1.  **Monograma N:** letra N estilizada, minimalista e memorável.
2.  **Órbita digital:** símbolo inspirado em órbitas, conexões e
    movimento.
3.  **Símbolo geométrico:** conexões, rede e tecnologia.
4.  **Forma abstrata:** ícone exclusivo sem depender de letras.

**Direção recomendada:** explorar primeiro o monograma N e a órbita
digital. O nome NEXUS é provisório e precisa passar por pesquisa de
disponibilidade, domínio e marca antes de ser adotado definitivamente.

------------------------------------------------------------------------

## 3. Interface principal

A interface deve ser organizada em três áreas:

1.  **Sidebar:** workspaces, Dev Center, coleções, histórico e
    configurações.
2.  **Área de navegação:** abas, endereço, controles de navegação e
    conteúdo web.
3.  **Painéis auxiliares:** ferramentas de desenvolvimento, notas,
    inspector e outros recursos.

### Estrutura sugerida da sidebar

  Área          Função
  ------------- ---------------------------------------------
  Workspaces    Ambientes separados por projeto ou contexto
  Dev Center    Ferramentas de desenvolvimento
  Collections   Sites, links e recursos salvos
  History       Histórico visual e sessões anteriores
  Settings      Preferências, temas e configurações

A sidebar deve ser recolhível para liberar espaço de navegação.

### Elementos da janela

-   Barra superior com controles da janela.
-   Barra de endereço com pesquisa e navegação.
-   Abas verticais ou agrupadas.
-   Indicador visual do workspace ativo.
-   Acesso rápido ao Command Center.
-   Painéis laterais que possam ser abertos e fechados.
-   New Tab personalizável.

------------------------------------------------------------------------

## 4. Funcionalidades exclusivas

### 4.1. Nexus Workspaces

**Prioridade: alta**

Ambientes de navegação separados por projeto ou atividade.

Exemplos:

-   **Trabalho:** GitHub, Jira, Slack e sistemas corporativos.
-   **Projeto pessoal:** localhost, Supabase e Vercel.
-   **Estudos:** documentação, cursos e vídeos.

Cada workspace poderá ter:

-   Nome, ícone e cor próprios.
-   Abas e grupos independentes.
-   Favoritos específicos.
-   Sessões salvas.
-   Configurações visuais próprias.
-   Opção de restaurar o ambiente anterior.

**Requisito técnico importante:** se houver separação de cookies, logins
e armazenamento, utilizar partições de sessão isoladas e corretamente
gerenciadas. Não confundir separação visual de workspaces com isolamento
real de dados.

### 4.2. Nexus DevTools

**Prioridade: alta**

Um centro de ferramentas para desenvolvedores, com painel lateral de
diagnóstico rápido.

Recursos planejados:

-   Console JavaScript.
-   Inspeção de requisições HTTP.
-   Visualização de headers e payloads.
-   Gerenciador de cookies.
-   Visualização de LocalStorage e SessionStorage.
-   Gerador de QR Code da página.
-   Testador de responsividade.
-   Informações de segurança e certificados.

Não é necessário reimplementar o DevTools do Chromium. A proposta é
integrar o Chrome DevTools Protocol (CDP) e criar uma experiência
própria sobre os recursos disponíveis.

### 4.3. Nexus Command Center

**Prioridade: alta**

Central de comandos aberta pelo atalho `Ctrl + K`.

Exemplos de comandos:

``` text
> Abrir GitHub
> Criar workspace
> Abrir localhost:3000
> Limpar cache deste site
> Abrir DevTools
> Tirar screenshot
> Criar anotação
> Alternar para modo foco
> Buscar nas abas abertas
```

O objetivo é permitir controlar as principais funções do navegador pelo
teclado.

### 4.4. Nexus Localhost

**Prioridade: alta / diferencial técnico**

Painel para organizar projetos e serviços locais do desenvolvedor.

Exemplo:

  Projeto       Endereço           Estado ilustrativo
  ------------- ------------------ --------------------
  Meu Next.js   `localhost:3000`   Online
  API Node      `localhost:4000`   Online
  Admin Panel   `localhost:5173`   Online
  WordPress     `localhost:8080`   Offline

Funcionalidades:

-   Salvar projetos e endereços locais.
-   Abrir projetos com um clique.
-   Exibir portas configuradas.
-   Mostrar disponibilidade dos serviços cadastrados.
-   Criar atalhos por workspace.

A detecção poderá usar um processo local auxiliar com permissões
restritas. Não deve escanear indiscriminadamente a rede do usuário. O
usuário deve controlar quais endereços e portas serão monitorados.

### 4.5. Nexus Inspector

**Prioridade: média / alta**

Ferramenta de inspeção de APIs.

Fluxo desejado: selecionar uma requisição na aba Network e enviá-la ao
Inspector.

Informações exibidas:

-   URL e método HTTP.
-   Headers.
-   Payload.
-   Resposta JSON formatada.
-   Status HTTP.
-   Tempo de resposta.
-   Opção de copiar como cURL.

A proposta é oferecer um pequeno inspetor integrado, sem tentar
substituir ferramentas especializadas como Postman ou Insomnia.

### 4.6. Nexus Focus

**Prioridade: média**

Modo de concentração que:

-   Oculta a sidebar.
-   Reduz distrações visuais.
-   Permite silenciar notificações.
-   Mantém a página atual em destaque.
-   Pode oferecer sessões de foco.

### 4.7. Nexus Visual History

**Prioridade: média**

Histórico organizado visualmente por data, workspace e atividade.

Recursos:

-   Miniaturas dos sites visitados.
-   Pesquisa por título e domínio.
-   Agrupamento por dia.
-   Recuperação de grupos de abas.
-   Restauração de sessões anteriores.

O histórico deve respeitar as configurações de privacidade e oferecer
controles claros para apagar dados.

------------------------------------------------------------------------

## 5. Funcionalidades complementares

  Funcionalidade       Descrição                                     Prioridade
  -------------------- --------------------------------------------- ------------
  Split View           Duas páginas na mesma janela                  Alta
  Tab Groups           Agrupamento de abas                           Alta
  Screenshot Vault     Biblioteca de capturas de tela                Média
  Quick Notes          Notas vinculadas a sites                      Alta
  JSON Viewer          Formatação automática de JSON                 Alta
  Color Picker         Captura de cores de páginas                   Média
  Responsive Preview   Visualização em diferentes resoluções         Alta
  GitHub Integration   Atalhos e informações de repositórios         Média
  Theme Marketplace    Temas criados pela comunidade                 Baixa
  AI Assistant         Assistente contextual para páginas e código   Futura

A implementação deve priorizar ferramentas que possam ser confiáveis,
rápidas e seguras. Recursos de IA e integrações externas ficam para
depois do núcleo do navegador.

------------------------------------------------------------------------

## 6. Stack tecnológica recomendada

### Decisão inicial

Começar com **Electron + React + TypeScript**, utilizando o Chromium
embarcado pelo Electron.

Essa escolha permite construir um navegador desktop customizado sem
manter inicialmente um fork completo do Chromium.

  Tecnologia     Responsabilidade
  -------------- -----------------------------------------------------------
  Electron       Aplicação desktop e integração com Chromium
  React          Interface e componentes
  TypeScript     Tipagem e segurança no desenvolvimento
  Vite           Desenvolvimento e build do frontend
  Tailwind CSS   Estilização e design system
  Zustand        Gerenciamento de estado
  SQLite         Persistência local de configurações, histórico e coleções

### Arquitetura simplificada

``` mermaid
flowchart TB
    A["NEXUS Browser"] --> B["Electron Main Process"]
    A --> C["React Renderer"]
    B --> D["Chromium / WebContents"]
    B --> E["Gerenciador de sessões"]
    B --> F["SQLite"]
    B --> G["Serviços locais"]
    C --> H["Interface e Design System"]
    C --> I["Workspaces"]
    C --> J["Command Center"]
    C --> K["Dev Center"]
    K --> L["CDP / DevTools"]
    H --> M["Estado global"]
```

### Segurança e arquitetura

-   Utilizar `contextIsolation: true`.
-   Manter `nodeIntegration: false` nas páginas web.
-   Implementar preload com API mínima e explícita.
-   Criar comunicação controlada entre renderer e processo principal.
-   Separar sessões e armazenamento dos workspaces quando necessário.
-   Restringir permissões de câmera, microfone, localização e
    notificações.
-   Controlar navegação externa e abertura de novas janelas.
-   Validar URLs e mensagens IPC.
-   Planejar atualizações regulares do Electron/Chromium.
-   Não expor APIs privilegiadas do Electron a páginas remotas.

### Quando considerar outra tecnologia?

-   **Electron:** melhor caminho inicial para velocidade de
    desenvolvimento e interface customizada.
-   **CEF:** alternativa para maior controle da integração com Chromium,
    com maior complexidade operacional.
-   **Fork do Chromium:** considerar somente se o produto precisar de
    modificações profundas no motor, recursos nativos ou controle que
    Electron/CEF não ofereçam.

A escolha inicial recomendada continua sendo Electron.

------------------------------------------------------------------------

## 7. Roadmap de desenvolvimento

O desenvolvimento será dividido em seis fases para evitar tentar
construir tudo de uma vez.

### Fase 01 --- Fundação

**Objetivo:** ter um navegador funcional.

-   Configurar Electron.
-   Configurar React, TypeScript e Vite.
-   Criar estrutura de pastas.
-   Implementar janela principal.
-   Integrar WebContents.
-   Criar barra de endereço.
-   Implementar navegação e abas.
-   Implementar histórico e favoritos.
-   Tratar erros de carregamento e navegação.

**Entrega:** navegador funcional com identidade visual inicial.

### Fase 02 --- Design System e experiência visual

**Objetivo:** estabelecer a identidade premium.

-   Sidebar personalizável.
-   Abas verticais.
-   Temas.
-   Animações.
-   Página New Tab.
-   Command Center.
-   Atalhos de teclado.
-   Configurações visuais.
-   Componentes reutilizáveis.

**Entrega:** experiência visual consistente e reconhecível.

### Fase 03 --- Produtividade

**Objetivo:** melhorar a organização da navegação.

-   Workspaces.
-   Grupos de abas.
-   Split View.
-   Cofre de sessões.
-   Histórico visual.
-   Quick Notes.
-   Collections.

**Entrega:** organização avançada da navegação.

### Fase 04 --- Developer Experience

**Objetivo:** entregar ferramentas próprias para desenvolvedores.

-   Nexus DevTools.
-   Nexus Localhost.
-   Nexus Inspector.
-   JSON Viewer.
-   Color Picker.
-   Responsive Preview.
-   Screenshot Vault.

**Entrega:** conjunto integrado de ferramentas de desenvolvimento.

### Fase 05 --- Inteligência e integrações

**Objetivo:** ampliar a utilidade e o ecossistema.

-   Assistente contextual.
-   Integração com GitHub.
-   Busca inteligente.
-   Automação de comandos.
-   Integrações adicionais.

**Entrega:** recursos avançados e integrações.

### Fase 06 --- Lançamento

**Objetivo:** preparar uma versão distribuível.

-   Instalador para Windows.
-   Atualizações automáticas.
-   Assinatura do executável.
-   Testes de desempenho.
-   Testes de segurança.
-   Testes de compatibilidade.
-   Documentação.
-   Site oficial.
-   Versão beta pública.

**Entrega:** primeira versão pública do NEXUS.

------------------------------------------------------------------------

## 8. Estrutura inicial de pastas

``` text
nexus-browser/
│
├── electron/
│   ├── main/
│   │   ├── index.ts
│   │   ├── window.ts
│   │   ├── browser.ts
│   │   └── permissions.ts
│   │
│   ├── preload/
│   │   └── index.ts
│   │
│   └── services/
│       ├── session.service.ts
│       ├── history.service.ts
│       └── storage.service.ts
│
├── src/
│   ├── components/
│   │   ├── sidebar/
│   │   ├── browser/
│   │   ├── tabs/
│   │   ├── command-center/
│   │   └── ui/
│   │
│   ├── features/
│   │   ├── workspaces/
│   │   ├── dev-center/
│   │   ├── inspector/
│   │   ├── collections/
│   │   └── settings/
│   │
│   ├── hooks/
│   ├── stores/
│   ├── services/
│   ├── styles/
│   └── App.tsx
│
├── public/
├── package.json
└── tsconfig.json
```

Essa estrutura é um ponto de partida. Ela poderá evoluir conforme os
módulos e limites entre processos ficarem mais claros.

------------------------------------------------------------------------

## 9. Escopo do MVP

A primeira versão deve provar que o navegador é estável, agradável de
usar e tem diferenciais claros.

### Funcionalidades do MVP

-   [ ] Navegação Chromium funcional.
-   [ ] Interface Dark Futuristic.
-   [ ] Abas verticais.
-   [ ] Sidebar personalizável.
-   [ ] New Tab exclusiva.
-   [ ] Workspaces.
-   [ ] Command Center (`Ctrl + K`).
-   [ ] Histórico e favoritos.
-   [ ] Split View.
-   [ ] DevTools integradas.
-   [ ] Persistência das sessões.
-   [ ] Instalador para Windows.

### Deixar para versões posteriores

-   Nexus Inspector completo.
-   Nexus Localhost avançado.
-   Assistente de IA.
-   Marketplace de temas.
-   Integrações mais profundas com GitHub.
-   Sincronização entre dispositivos.

### Critérios mínimos de qualidade do MVP

-   Navegação estável em sites comuns.
-   Abas e sessões recuperadas corretamente.
-   Consumo de memória monitorado.
-   Atalhos de teclado consistentes.
-   Interface responsiva a diferentes tamanhos de janela.
-   Permissões e isolamento de conteúdo configurados com segurança.
-   Atualização do Chromium/Electron planejada.
-   Falhas de abas tratadas sem derrubar toda a aplicação.

------------------------------------------------------------------------

## 10. Estratégia de produto

### 10.1. Não competir com o Chrome em quantidade de funcionalidades

O foco deve ser experiência: o navegador precisa ser bonito, rápido,
organizado e agradável.

### 10.2. Resolver problemas reais de desenvolvedores

Nexus Localhost, Nexus Inspector, Workspaces e Command Center têm
potencial para se tornar diferenciais mais relevantes do que efeitos
visuais isolados.

### 10.3. Acabamento premium desde o início

Mesmo que o MVP tenha poucas funcionalidades, o acabamento visual, os
estados de carregamento, as animações e os detalhes de interação devem
ser consistentes.

### 10.4. Privacidade e confiança

Um navegador lida com dados sensíveis. O produto deve explicar o que
armazena, oferecer controles de limpeza e evitar coleta desnecessária.
Integrações e recursos locais precisam de permissões claras.

------------------------------------------------------------------------

## 11. Próximos passos

Antes de começar a implementação:

1.  Definir o nome definitivo e verificar domínio, marca e
    disponibilidade.
2.  Criar o logotipo e o ícone do aplicativo.
3.  Desenhar a interface principal em alta fidelidade.
4.  Definir o design system e os componentes.
5.  Validar a arquitetura técnica com um protótipo pequeno.
6.  Iniciar a Fase 01 do roadmap.

### Primeira entrega de design

A primeira tela a ser desenhada deve incluir:

-   Janela principal do navegador.
-   Sidebar com workspaces.
-   Barra de endereço.
-   Abas verticais.
-   Área de conteúdo.
-   Painel lateral de ferramentas.
-   Estados de hover, foco, seleção e carregamento.

**Recomendação final:** começar pelo design da interface principal antes
de implementar todas as funcionalidades. Isso cria uma direção visual
consistente e reduz retrabalho durante o desenvolvimento.

------------------------------------------------------------------------

## 12. Referências oficiais

-   [Electron --- documentação](https://www.electronjs.org/docs/latest/)
-   [Electron ---
    WebContents](https://www.electronjs.org/docs/latest/api/web-contents)
-   [Chrome DevTools
    Protocol](https://chromedevtools.github.io/devtools-protocol/)
-   [SQLite --- documentação](https://www.sqlite.org/docs.html)
-   [Arc Browser](https://arc.net/)
-   [Vivaldi](https://vivaldi.com/)
-   [Zen Browser](https://zen-browser.app/)
-   [Opera](https://www.opera.com/)

------------------------------------------------------------------------

**Documento de visão e planejamento do NEXUS Browser.**\
As funcionalidades, arquitetura e identidade descritas são propostas
iniciais e devem ser validadas por protótipos e testes antes de se
tornarem requisitos definitivos.
