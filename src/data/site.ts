// Conteúdo do site. Edite aqui para atualizar textos, palestrantes e fotos.

export const SITE = {
  name: "SDII",
  fullName: "Simpósio de Doenças Infecciosas e Inflamatórias",
  instagram: "https://www.instagram.com/sdii_oficial",
  instagramHandle: "@sdii_oficial",
  // Preencha para exibir o e-mail de contato na seção "Contato".
  email: "",
}

export const NAV = [
  { href: "#inicio", label: "Início" },
  { href: "#sobre", label: "Sobre" },
  { href: "#edicoes", label: "Edições" },
  { href: "#palestrantes", label: "Palestrantes" },
  { href: "#galeria", label: "Galeria" },
  { href: "#contato", label: "Contato" },
]

export const EDITIONS = [
  {
    id: "i",
    numeral: "I",
    title: "I Simpósio",
    place: "Fiocruz Piauí",
    date: "Edição inaugural",
    status: "Realizado",
    image: "/images/g-mesa.webp",
    imageClass: "object-cover",
    cta: { label: "Ver galeria", href: "#galeria" },
  },
  {
    id: "ii",
    numeral: "II",
    title: "II Simpósio",
    place: "Fortaleza · Ceará — Fiocruz Ceará",
    date: "17, 18 e 19 de novembro de 2026",
    status: "Realizado",
    image: "/images/banner-ii.webp",
    imageClass: "object-contain bg-[#fbf8f2]",
    cta: { label: "Ver palestrantes", href: "#palestrantes" },
  },
  {
    id: "iii",
    numeral: "III",
    title: "III Simpósio",
    place: "Porto Velho · Rondônia",
    date: "14 a 16 de setembro de 2027",
    status: "Em breve",
    image: "/images/logo-iii.webp",
    imageClass: "object-contain bg-white p-4",
    cta: { label: "Acompanhe no Instagram", href: SITE.instagram, external: true },
  },
]

export type Person = { name: string; org: string; topic?: string; role?: string }

export const COORDINATION: Person[] = [
  { name: "Jaime Ribeiro Filho", org: "Fiocruz Ceará • TGHN-LAC", role: "Coordenação científica", topic: "Produtos naturais e doenças inflamatórias e infecciosas" },
  { name: "Herbert Leonel de Matos Guedes", org: "UFRJ • Fiocruz", role: "Coordenação científica", topic: "Imunologia e leishmaniose" },
  { name: "Carlos Augusto", org: "Fiocruz Ceará", role: "Coordenação executiva", topic: "Gestão de projetos e organização científica" },
  { name: "Ketlen Ohse", org: "Fiocruz Ceará • TGHN-LAC", role: "Coordenação executiva", topic: "Pesquisa e articulação científica" },
]

export const TABLES: Person[] = [
  { name: "João Martins", org: "Centro Pasteur-Fiocruz", role: "Mesa de abertura", topic: "Coordenador • Pesquisador da Fiocruz Ceará" },
  { name: "Caroline Passaes", org: "Centro Pasteur-Fiocruz", role: "Mesa de abertura", topic: "Coordenadora • Pesquisadora do Institut Pasteur" },
  { name: "Roberto Nicolete", org: "Fiocruz Ceará", role: "Mesa de abertura", topic: "Coordenador de Pesquisa • Pesquisador Titular" },
  { name: "Alda Maria da Cruz", org: "Fiocruz", role: "Mesa de encerramento", topic: "Vice-Presidente de Pesquisa e Coleções Biológicas • Pesquisadora do IOC" },
  { name: "Clarissa Romero Teixeira", org: "Fiocruz Ceará", role: "Mesa de encerramento", topic: "Imunoparasitologia e leishmanioses" },
]

export const SPEAKERS: Person[] = [
  { name: "Felipe Augusto Rocha Rodrigues", org: "IFCE", topic: "Biotecnologia da pele de tilápia" },
  { name: "Edmar Maciel", org: "Instituto Dr. José Frota", topic: "Biotecnologia da pele de tilápia" },
  { name: "Yanna Carolina Ferreira Teles", org: "UFPB", topic: "Patentes e inovação farmacêutica e biotecnologia" },
  { name: "Celio Geraldo Freire-de-Lima", org: "UFRJ", topic: "Imunomodulação e criptococose" },
  { name: "Débora Decote Ricardo", org: "UFRRJ", topic: "Imunologia, fungos e infectividade" },
  { name: "Micaela de Melo Cordeiro Eulálio", org: "Fiocruz Rondônia", topic: "Imunologia celular e inflamação" },
  { name: "Vladimir Costa Silva", org: "Fiocruz Piauí", topic: "Vigilância genômica de bactérias multirresistentes" },
  { name: "Alessandra D. Almeida Filardy", org: "UFRJ", topic: "Eferocitose e pneumonia bacteriana" },
  { name: "Roberta Olmo Pinheiro", org: "IOC/Fiocruz", topic: "Hanseníase e dano neural" },
  { name: "Carla Celedônio", org: "Fiocruz Ceará", topic: "Coordenadora • Nanocorpos e biotecnologia" },
  { name: "Manoel Oliveira", org: "IOC/Fiocruz", topic: "Fungos emergentes e biodiversidade" },
  { name: "Patrícia Neves", org: "Fiocruz", topic: "Desenvolvimento de vacinas RNA" },
  { name: "Flávia Lima Ribeiro Gomes", org: "IOC/Fiocruz", topic: "Coinfecções, malária e leishmaniose" },
  { name: "Lucia Pinto", org: "UFRRJ", topic: "Imunologia e leishmaniose felina" },
  { name: "Eduardo Fonseca Pinto", org: "IOC/Fiocruz", topic: "Imunopatogênese da leishmaniose visceral" },
  { name: "Alessandra Martins", org: "UNIRIO", topic: "Imunoterapia de precisão e leishmaniose" },
  { name: "Christian Pinheiro", org: "UFC • Fiocruz Ceará", topic: "Doutorando • Imunoinformática e vacinas" },
  { name: "Danielle Nascimento", org: "UFRRJ", topic: "Infecção experimental por Sporothrix" },
  { name: "Kamilla Pinto", org: "UFRJ", topic: "Eixo pulmão-cérebro e imunossenescência" },
  { name: "Fernando Bezerra", org: "UFC", topic: "Geohelmintíases e saúde pública" },
  { name: "Wilson Savino", org: "Fundação Oswaldo Cruz", topic: "Pesquisador Titular • Assessor Especial da Presidência para cooperação com instituições francesas de Ciência e Tecnologia" },
]

export const GALLERY = [
  { src: "/images/g-mesa.webp", alt: "Mesa de abertura do I Simpósio, com flores à frente e telão de abertura ao fundo", span: "md:col-span-2 md:row-span-2" },
  { src: "/images/g-palestra-1.webp", alt: "Pesquisador palestrando diante do painel da Fiocruz Piauí" },
  { src: "/images/g-homenagem.webp", alt: "Três participantes do simpósio posando com uma lembrança" },
  { src: "/images/g-palestra-3.webp", alt: "Palestra sobre produtos naturais e novos tratamentos para a doença de Chagas" },
  { src: "/images/g-palestra-2.webp", alt: "Palestra sobre gastronomia darwiniana e uso de especiarias" },
  { src: "/images/g-confraternizacao.webp", alt: "Confraternização dos participantes em um restaurante", span: "md:col-span-2" },
  { src: "/images/g-palestra-4.webp", alt: "Palestra sobre a dinâmica das células imunes na infecção por Leishmania amazonensis" },
  { src: "/images/g-midia-tv.webp", alt: "Entrevista exibida em programa de televisão" },
  { src: "/images/g-palestra-5.webp", alt: "Palestra sobre esporotricose como desafio de saúde pública" },
  { src: "/images/g-palestra-7.webp", alt: "Palestra sobre o papel do TLR-9 na resposta imune à infecção por Cryptococcus gattii" },
  { src: "/images/g-plateia.webp", alt: "Palestrante e plateia durante uma apresentação", span: "md:col-span-2" },
]
