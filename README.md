# SDII — Simpósio de Doenças Infecciosas e Inflamatórias

Site em **React 19 + Vite + Tailwind CSS 4 + shadcn/ui** (componentes em `src/components/ui`).
Estrutura inspirada em oralgut.com: slider de destaque, edições, contato e rodapé.

## Rodar
```bash
npm install
npm run dev      # desenvolvimento
npm run build    # gera dist/
```

## Editar conteúdo
Tudo fica em `src/data/site.ts` (edições, palestrantes, galeria, Instagram e **e-mail de contato** — preencha `SITE.email` para exibi-lo).
Imagens em `public/images/`. Cores e fontes em `src/index.css`.

Para adicionar novos componentes shadcn: `npx shadcn@latest add <componente>` (o `components.json` já está configurado).
