# WRB-TV iPhone (Cloudflare Worker + PWA)

Este repositório contém o projeto independente da WRB-TV para iPhone como Progressive Web App (PWA). No Safari, a instalação é feita por **Compartilhar → Adicionar à Tela de Início**. Não é um IPA nativo e não exige publicação na App Store.

## Arquitetura isolada e sem Containers

- Worker exclusivo: `wrbtv-iphone-pwa-20261016-3858215c`.
- Interface e arquivos estáticos servidos de `public/`.
- A API Xtream e o proxy HLS são executados diretamente dentro de `src/index.js`, chamando `netlify/functions/api.mjs`. O código de API usa as APIs Web `Request`, `Response`, `fetch`, `URL` e `AbortController`, suportadas pelo runtime Workers.
- O fluxo do aplicativo não chama outro Worker nem acessa os projetos Windows, Android, `wrbtv-smart-gateway` ou `r-contemporaneo`.
- A rota `/health` informa se o Worker está respondendo. As rotas `/api`, `/api/*` e `/stream` executam a API dentro do mesmo Worker.
- Não há entrada `containers` no `wrangler.jsonc`. A publicação desta versão não exige a permissão account-wide `Workers Containers Write`.
- Os nomes das duas classes Durable Object e suas declarações SQLite existentes permanecem no bundle para evitar apagar namespaces existentes durante esta mudança. Não são chamadas pelo fluxo HTTP. As associações de Container não são usadas.
- `Dockerfile` e `app/server.mjs` permanecem no repositório como arquivos de referência; eles não fazem parte da execução publicada dessa arquitetura.

## Permissões do token de publicação

Use um API Token com papel **Workers Editor** limitado ao Worker existente `wrbtv-iphone-pwa-20261016-3858215c`. Não adicione `Workers Containers Write`, pois essa permissão é account-scoped e concederia escrita em outros Containers da conta.

O workflow verifica a presença das credenciais e confirma que o Worker específico existe antes de publicar. Se não puder confirmar o alvo, ele aborta.

Cadastre em **GitHub → Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`: token limitado ao Worker acima.
- `CLOUDFLARE_ACCOUNT_ID`: Account ID da conta Cloudflare usada pelo projeto.

Não coloque tokens no código, no README, nos issues ou nesta conversa.

## Publicação

O workflow de publicação é iniciado em **Actions → Deploy WRB-TV iPhone to Cloudflare Workers → Run workflow**. Alterações relevantes ao código também acionam o workflow, que aborta com segurança se as credenciais não existirem.

## Verificações

O workflow de validação executa:

- Sintaxe da API e do Worker.
- `wrangler deploy --dry-run` para validar o bundle.
- Smoke tests do handler da API: OPTIONS/CORS, método inválido e JSON inválido.
- Integridade do manifesto e dos assets PWA.
- Verificações explícitas de que o Worker não usa Container e de que as declarações existentes dos Durable Objects são preservadas.

A validação automatizada não substitui a confirmação do deploy real e o teste de `/health` e do login em produção.

## Limitações do iOS

- Trata-se de uma PWA, não de um aplicativo iOS nativo.
- O iOS pode exigir toque do usuário antes de iniciar áudio ou vídeo.
- A reprodução depende do suporte do Safari/iOS aos formatos dos fluxos.
- A sessão é armazenada no `localStorage` dessa origem HTTPS; mudar de domínio pode exigir novo login.
