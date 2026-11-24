const API = "http://localhost:3000";

const EMOJIS = {
    documento: "📄",
    chaves: "🔑",
    celular: "📱",
    carteira: "👛",
    pet: "🐶",
    outros: "📦",
};

const mural = document.getElementById("mural");
const form = document.getElementById("form-item");
const modal = document.getElementById("modal");
const modalTitulo = document.getElementById("modal-titulo");
const btnNova = document.getElementById("btn-nova");
const aviso = document.getElementById("aviso");
const erroForm = document.getElementById("erro-form");
const filtroTipo = document.getElementById("filtro-tipo");
const filtroCategoria = document.getElementById("filtro-categoria");
const btnEnviar = document.getElementById("btn-enviar");
const btnCancelar = document.getElementById("btn-cancelar");
const btnTema = document.getElementById("btn-tema");
const btnTopo = document.getElementById("btn-topo");

let editandoId = null;
let senhaEdicao = null;

/* ---------- Modal ---------- */

function abrirModal(titulo) {
    modalTitulo.textContent = titulo;
    erroForm.textContent = "";
    modal.showModal();
}

function mostrarAviso(texto) {
    aviso.textContent = texto;
    setTimeout(() => {
        aviso.textContent = "";
    }, 4000);
}

btnNova.addEventListener("click", () => abrirModal("Nova postagem"));
btnCancelar.addEventListener("click", () => modal.close());

// Fecha ao clicar no fundo escuro (só se o clique começou e terminou nele,
// para não fechar quando a pessoa seleciona texto e solta o mouse fora)
let cliqueComecouNoFundo = false;

modal.addEventListener("mousedown", (e) => {
    cliqueComecouNoFundo = e.target === modal;
});

modal.addEventListener("click", (e) => {
    if (e.target === modal && cliqueComecouNoFundo) modal.close();
});

// Roda quando o modal fecha, por qualquer caminho (Cancelar, Esc, fundo ou sucesso)
modal.addEventListener("close", sairModoEdicao);

/* ---------- Edição ---------- */

async function iniciarEdicao(item) {
    const senha = prompt("Digite a senha da postagem para editar:");
    if (!senha) return;

    try {
        const resposta = await fetch(`${API}/api/itens/${item.id_mural}/verificar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ senha }),
        });

        if (!resposta.ok) {
            const erro = await resposta.json();
            alert(erro.erro);
            return;
        }

        entrarModoEdicao(item, senha);
    } catch (error) {
        console.error("Erro ao verificar a senha:", error);
    }
}

function entrarModoEdicao(item, senha) {
    editandoId = item.id_mural;
    senhaEdicao = senha;

    form.elements.titulo.value = item.titulo;
    form.elements.descricao.value = item.descricao || "";
    form.elements.local.value = item.local;
    form.elements.tipo.value = item.tipo;
    form.elements.categoria.value = item.categoria;
    form.elements.contato.value = item.contato;
    form.elements.data_perdido_achado.value = item.data_perdido_achado
        ? item.data_perdido_achado.slice(0, 10)
        : "";

    form.elements.senha.value = "";
    form.elements.senha.disabled = true;
    form.elements.foto.disabled = true;

    btnEnviar.textContent = "Salvar alterações";
    abrirModal("Editar postagem");
}

function sairModoEdicao() {
    editandoId = null;
    senhaEdicao = null;
    form.reset();
    form.elements.senha.disabled = false;
    form.elements.foto.disabled = false;
    btnEnviar.textContent = "Cadastrar";
    erroForm.textContent = "";
}

async function salvarEdicao() {
    const dados = Object.fromEntries(new FormData(form));
    dados.senha = senhaEdicao;

    try {
        const resposta = await fetch(`${API}/api/itens/${editandoId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dados),
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
            erroForm.textContent = resultado.erro;
            return;
        }

        modal.close();
        mostrarAviso(resultado.mensagem);
        await carregarItens();
    } catch (error) {
        console.error("Erro ao editar:", error);
        erroForm.textContent = "Não foi possível salvar. Tente novamente.";
    }
}

/* ---------- Cadastro, resolver e apagar ---------- */

async function criarItem() {
    const dados = new FormData(form);

    try {
        const resposta = await fetch(`${API}/api/itens`, {
            method: "POST",
            body: dados,
        });

        if (!resposta.ok) {
            const erro = await resposta.json();
            erroForm.textContent = erro.erro;
            return;
        }

        modal.close();
        mostrarAviso("Item cadastrado com sucesso!");
        await carregarItens();
    } catch (error) {
        console.error("Erro ao cadastrar:", error);
        erroForm.textContent = "Não foi possível cadastrar. Tente novamente.";
    }
}

async function apagarItem(id) {
    const senha = prompt("Digite a senha da postagem:");
    if (!senha) return;

    try {
        const resposta = await fetch(`${API}/api/itens/${id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ senha }),
        });

        const resultado = await resposta.json();
        alert(resultado.mensagem || resultado.erro);

        if (resposta.ok) carregarItens();
    } catch (error) {
        console.error("Erro ao apagar:", error);
    }
}

async function marcarResolvido(id) {
    const senha = prompt("Digite a senha da postagem:");
    if (!senha) return;

    try {
        const resposta = await fetch(`${API}/api/itens/${id}/resolvido`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ senha }),
        });

        const resultado = await resposta.json();
        alert(resultado.mensagem || resultado.erro);

        if (resposta.ok) carregarItens();
    } catch (error) {
        console.error("Erro ao atualizar:", error);
    }
}

/* ---------- Feed ---------- */

function criarPost(item) {
    const emoji = EMOJIS[item.categoria] ?? "📦";

    const post = document.createElement("article");
    post.classList.add("post");
    if (item.resolvido === "sim") post.classList.add("resolvido");

    // Cabeçalho: tipo (achado/perdido) e categoria
    const cabecalho = document.createElement("div");
    cabecalho.classList.add("post-cabecalho");

    const tipo = document.createElement("span");
    tipo.classList.add("tipo", item.tipo);
    tipo.textContent = item.tipo;

    const categoria = document.createElement("span");
    categoria.textContent = `${emoji} ${item.categoria}`;

    cabecalho.append(tipo, categoria);

    // Mídia: foto ou bloco com o emoji da categoria
    let midia;
    if (item.foto) {
        midia = document.createElement("img");
        midia.classList.add("post-foto");
        midia.src = item.foto;
        midia.alt = item.titulo;
    } else {
        midia = document.createElement("div");
        midia.classList.add("post-sem-foto");
        midia.textContent = emoji;
    }

    // Corpo
    const corpo = document.createElement("div");
    corpo.classList.add("post-corpo");

    const titulo = document.createElement("h3");
    titulo.textContent = item.titulo;

    const descricao = document.createElement("p");
    descricao.textContent = item.descricao || "Sem descrição";

    const local = document.createElement("p");
    local.textContent = `📍 ${item.local}`;

    const dataEl = document.createElement("p");
    dataEl.textContent = item.data_perdido_achado
        ? `📅 ${new Date(item.data_perdido_achado).toLocaleDateString("pt-BR")}`
        : "📅 Data não informada";

    const contato = document.createElement("p");
    contato.textContent = `📞 ${item.contato}`;

    const status = document.createElement("p");
    status.textContent = item.resolvido === "sim" ? "Resolvido ✅" : "Em aberto";

    const acoes = document.createElement("div");
    acoes.classList.add("acoes");

    if (item.resolvido !== "sim") {
        const btnResolvido = document.createElement("button");
        btnResolvido.textContent = "Marcar como resolvido";
        btnResolvido.addEventListener("click", () => marcarResolvido(item.id_mural));
        acoes.appendChild(btnResolvido);
    }

    const btnEditar = document.createElement("button");
    btnEditar.textContent = "Editar";
    btnEditar.addEventListener("click", () => iniciarEdicao(item));
    acoes.appendChild(btnEditar);

    const btnApagar = document.createElement("button");
    btnApagar.textContent = "Apagar";
    btnApagar.addEventListener("click", () => apagarItem(item.id_mural));
    acoes.appendChild(btnApagar);

    corpo.append(titulo, descricao, local, dataEl, contato, status, acoes);

    post.append(cabecalho, midia, corpo);
    return post;
}

async function carregarItens() {
    try {
        const params = new URLSearchParams();
        if (filtroTipo.value) params.append("tipo", filtroTipo.value);
        if (filtroCategoria.value) params.append("categoria", filtroCategoria.value);

        const resposta = await fetch(`${API}/api/itens?${params}`);

        if (!resposta.ok) throw new Error("Erro ao buscar itens");

        const itens = await resposta.json();

        mural.textContent = "";

        if (itens.length === 0) {
            const vazio = document.createElement("p");
            vazio.classList.add("vazio");
            vazio.textContent = "Nenhum item encontrado.";
            mural.appendChild(vazio);
            return;
        }

        itens.forEach((item) => {
            mural.appendChild(criarPost(item));
        });
    } catch (error) {
        console.error("Erro ao carregar:", error);
    }
}

/* ---------- Eventos ---------- */

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (editandoId !== null) {
        await salvarEdicao();
    } else {
        await criarItem();
    }
});

// tema para claro e escuro

function aplicarTema(tema) {
    document.documentElement.dataset.theme = tema;
    btnTema.textContent = tema === "dark" ? "☀️" : "🌙";
    btnTema.setAttribute(
        "aria-label",
        tema === "dark" ? "Ativar modo claro" : "Ativar modo escuro"
    );
}

btnTema.addEventListener("click", () => {
    const novoTema = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    aplicarTema(novoTema);
    try {
        localStorage.setItem("tema", novoTema);
    } catch (error) {
        console.error("Não foi possível salvar o tema:", error);
    }
});

aplicarTema(document.documentElement.dataset.theme ?? "light");

/* botao para voltar ao topo */

function atualizarBotaoTopo() {
    btnTopo.hidden = window.scrollY < 400;
}

window.addEventListener("scroll", atualizarBotaoTopo, { passive: true });

btnTopo.addEventListener("click", () => {
    const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduzirMovimento ? "auto" : "smooth" });
});

atualizarBotaoTopo();

filtroTipo.addEventListener("change", carregarItens);
filtroCategoria.addEventListener("change", carregarItens);

carregarItens();