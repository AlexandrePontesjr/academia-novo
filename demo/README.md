# DukFit — Demonstração Estática (Mock Completo)

Esta pasta contém um **mock estático completo** de todas as 34 telas do sistema **DukFit**, pronto para ser exposto ao cliente sem necessidade de banco de dados, Docker ou backend.

## Como abrir localmente

Você pode abrir diretamente `demo/index.html` (ou `demo/mapa.html`) no navegador, ou subir um servidor estático simples:

```bash
npx serve demo
```

ou com Python:

```bash
python -m http.server 8080 --directory demo
```

## Como publicar para o cliente (gratuito)

Como a pasta `demo/` contém apenas HTML, CSS, JavaScript, fontes e imagens estáticas:

- **Vercel / Netlify / Cloudflare Pages**: aponte o diretório de publicação (`output directory`) para `demo`.
- **GitHub Pages**: publique o conteúdo da pasta `demo/`.
- **Nginx / Apache / S3**: copie o conteúdo de `demo/` para o diretório público.

## Recursos da demonstração

- **Barra flutuante "Modo Demo"**: presente no canto inferior esquerdo de todas as telas para abrir o índice rápido com as 34 páginas ou ir para `mapa.html`.
- **Simulador de Perfil**: no topo das telas internas, troque entre **Administrador**, **Recepção**, **Professor** e **Aluno (Portal)** para mostrar as diferentes visões do sistema.
- **Interações simuladas**: busca de alunos, filtros de status, balcão de check-in com 3 cenários, confirmação de pagamento, conversão de lead, aprovação de foto e formulários com feedback visual.
