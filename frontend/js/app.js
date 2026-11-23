const API = "http://localhost:3000";

const mural = document.getElementById("mural");
const form = document.getElementById("form-item");
const mensagem = document.getElementById("mensagem");
const filtroTipo = document.getElementById("filtro-tipo");
const filtroCategoria = document.getElementById("filtro-categoria");
const btnEnviar = document.getElementById("btn-enviar");
const btnCancelar = document.getElementById("btn-cancelar");

let editandoId = null;
let senhaEdicao = null;

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
    btnCancelar.hidden = false;
    mensagem.textContent = "Editando a postagem.";

    form.scrollIntoView({ behavior: "smooth" });
}

function sairModoEdicao() {
    editandoId = null;
    senhaEdicao = null;
    form.reset();
    form.elements.senha.disabled = false;
    form.elements.foto.disabled = false;
    btnEnviar.textContent = "Cadastrar";
    btnCancelar.hidden = true;
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
            mensagem.textContent = resultado.erro;
            return;
        }

        sairModoEdicao();
        mensagem.textContent = resultado.mensagem;
        await carregarItens();
    } catch (error) {
        console.error("Erro ao editar:", error);
        mensagem.textContent = "Não foi possível salvar. Tente novamente.";
    }
}

async function criarItem() {
    const dados = new FormData(form);

    try {
        const resposta = await fetch(`${API}/api/itens`, {
            method: "POST",
            body: dados,
        });

        if (!resposta.ok) {
            const erro = await resposta.json();
            mensagem.textContent = erro.erro;
            return;
        }

        mensagem.textContent = "Item cadastrado com sucesso!";
        form.reset();
        await carregarItens();
    } catch (error) {
        console.error("Erro ao cadastrar:", error);
        mensagem.textContent = "Não foi possível cadastrar. Tente novamente.";
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

        if (resposta.ok) {
            if (editandoId === id) sairModoEdicao();
            carregarItens();
        }
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
            const card = document.createElement("div");
            card.classList.add("card");
            if (item.resolvido === "sim") card.classList.add("resolvido");

            const titulo = document.createElement("h3");
            titulo.textContent = item.titulo;

            const tipo = document.createElement("span");
            tipo.classList.add("tipo", item.tipo);
            tipo.textContent = item.tipo;

            const descricao = document.createElement("p");
            descricao.textContent = item.descricao || "Sem descrição";

            const local = document.createElement("p");
            local.textContent = `Local: ${item.local}`;

            const contato = document.createElement("p");
            contato.textContent = `Entre em contato: ${item.contato}`;

            const categoria = document.createElement("span");
            categoria.textContent = `Categoria: ${item.categoria}`;

            const resolvido = document.createElement("span");
            resolvido.textContent = item.resolvido === "sim" ? "Resolvido ✅" : "Em aberto";

            const dataEl = document.createElement("p");
            const dataFormatada = item.data_perdido_achado
                ? new Date(item.data_perdido_achado).toLocaleDateString("pt-BR")
                : "Data não informada";
            dataEl.textContent = `Data: ${dataFormatada}`;

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

            card.append(titulo, tipo, descricao, local, contato, categoria, resolvido, dataEl, acoes);

            if (item.foto) {
                const imagem = document.createElement("img");
                imagem.src = `${API}/uploads/${item.foto}`;
                imagem.alt = item.titulo;
                card.prepend(imagem);
            }

            mural.appendChild(card);
        });
    } catch (error) {
        console.error("Erro ao carregar:", error);
    }
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (editandoId !== null) {
        await salvarEdicao();
    } else {
        await criarItem();
    }
});

btnCancelar.addEventListener("click", () => {
    sairModoEdicao();
    mensagem.textContent = "";
});

filtroTipo.addEventListener("change", carregarItens);
filtroCategoria.addEventListener("change", carregarItens);

carregarItens();