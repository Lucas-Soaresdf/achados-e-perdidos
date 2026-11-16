const mural = document.getElementById('mural');
const form = document.getElementById('form-item');

async function carregarItens() {
    try {
        const resposta = await fetch('http://localhost:3000/api/itens');

        if (!resposta.ok) throw new Error('Erro ao buscar itens');

        const itens = await resposta.json();

        mural.textContent = "";

        itens.forEach((item) => {
            const mostraItens = document.createElement('div');

            mostraItens.textContent = `Título da postagem: ${item.titulo} - Tipo do item achado ${item.tipo}`;

            mural.appendChild(mostraItens);
        });

    } catch (error) {
        console.log('Error ao carregar: ', error);
    }
}

carregarItens();

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const dados = Object.fromEntries(new FormData(form));

    try {
        const resposta = await fetch("http://localhost:3000/api/itens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dados)
        });

        if (!resposta.ok) throw new Error("Erro ao cadastrar");

        form.reset();

        await carregarItens();

    } catch (error) {
        console.error("Erro ao cadastrar:", error);
    }
});
