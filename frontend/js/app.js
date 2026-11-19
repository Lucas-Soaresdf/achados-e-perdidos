const mural = document.getElementById('mural');
const form = document.getElementById('form-item');
const mensagem = document.getElementById('mensagem');

async function carregarItens() {
    try {
        const resposta = await fetch('http://localhost:3000/api/itens');

        if (!resposta.ok) throw new Error('Erro ao buscar itens');

        const itens = await resposta.json();

        mural.textContent = "";

        itens.forEach((item) => {

            const card = document.createElement("div");
            card.classList.add("card");

            const titulo = document.createElement("h3");
            titulo.textContent = item.titulo;

            const tipo = document.createElement("span");
            tipo.textContent = item.tipo;

            const descricao = document.createElement("p");
            descricao.textContent = item.descricao || "Sem descrição";

            const local = document.createElement("p");
            local.textContent = `Local: ${item.local}`;

            const contato = document.createElement("p");
            contato.textContent = `Entre em contato: ${item.contato}`;

            const categoria = document.createElement("span");
            categoria.textContent = `Categoria do item: ${item.categoria}`;

            const resolvido = document.createElement("span");
            resolvido.textContent = item.resolvido === "sim" ? "Resolvido ✅" : " Em aberto";

            const dataEl = document.createElement("p");
            const dataFormatada = item.data_perdido_achado
                ? new Date(item.data_perdido_achado).toLocaleDateString("pt-BR")
                : "Data não informada";
            dataEl.textContent = `Data: ${dataFormatada}`;

            card.append(titulo, tipo, descricao, local, contato, categoria, resolvido, dataEl);

            if (item.foto) {
                const imagem = document.createElement("img");
                imagem.src = `http://localhost:3000/uploads/${item.foto}`;
                imagem.alt = item.titulo;
                card.prepend(imagem);
            }

            mural.appendChild(card);
        });

    } catch (error) {
        console.error('Erro ao carregar:', error);
    }
}

carregarItens();

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const dados = new FormData(form);

    try {
        const resposta = await fetch("http://localhost:3000/api/itens", {
            method: "POST",
            body: dados,
        });

        if (!resposta.ok) {
            const erro = await resposta.json();
            mensagem.textContent = erro.erro;
            return;
        }
        mensagem.textContent = "";

        form.reset();

        await carregarItens();

    } catch (error) {
        console.error("Erro ao cadastrar:", error);
    }
});

tipo.classList.add("tipo", item.tipo);