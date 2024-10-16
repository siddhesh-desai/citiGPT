const fs = require('fs');
const path = require('path');
const { ChatGroq } = require("@langchain/groq");
const { Pinecone } = require("@pinecone-database/pinecone");

require("dotenv").config();

// Rendering Chat Interface
const renderChatUI = async (req, res) => {
    try {
        const filePath = path.join(__dirname, '..', 'user_data', 'data.json');
        const userData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        if (userData) {
            return res.render("chat", { userData });
        }

        res.status(404).send("404 Error: User Data not found!");

    } catch (err) {
        console.log(err);
    }
};

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX_NAME;
const index = pc.index(indexName);

// Setting up the LLM
const llm = new ChatGroq({
    model: "llama-3.1-70b-versatile",
    temperature: 0,
    maxTokens: undefined,
    maxRetries: 2,
});

// Get Embeddings of the prompt
async function getEmbeddings(prompt) {
    const model = "multilingual-e5-large";
    const embeddings = await pc.inference.embed(model, [prompt], {
        inputType: "query",
    });
    return embeddings[0].values;
}

// Search in Pinecone
async function queryPinecone(embedding) {
    const queryResponse = await index.namespace(process.env.PINECONE_INDEX_NAMESPACE).query({
        topK: 3,
        vector: embedding,
        includeValues: false,
        includeMetadata: true,
    });

    return queryResponse.matches;
}

// Invoke the ChatGroq API with LLM
async function invokeChatGroq(messages) {
    const aiMsg = await llm.invoke(messages);
    return aiMsg;
}

class CitiGPT {
    constructor() {
        this.messages = [];
        this.turnLimit = 5;
    }


    addMessage(role, content) {
        this.messages.push({ role, content });
        if (this.messages.length > this.turnLimit) {
            this.messages.shift();
        }
    }


    async handleUserQuery(userData, userPrompt) {

        const embedding = await getEmbeddings(userPrompt);
        const references = await queryPinecone(embedding);

        const referenceContent = references.map((ref) => ref.metadata).join("\n");
        const messages = [
            {
                role: "system",
                content:
                    "You are a personal financial advisor that answers to persons financial queries in a short and simple language.",
            },
            {
                role: "system",
                content: JSON.stringify(userData),
            },
            { role: "system", content: JSON.stringify(this.messages) },
            { role: "user", content: JSON.stringify(userPrompt) },
            { role: "system", content: `References:\n${referenceContent}` },
        ];

        const llmResponse = await invokeChatGroq(messages);
        const ans = llmResponse.content;

        this.addMessage("user", userPrompt);
        this.addMessage("assistant", ans);

        return {
            response: ans,
            references: references.map((ref) => ref.metadata),
        };
    }
}

const chatbot = new CitiGPT();

const getChatResponse = async (req, res) => {
    // const userData = req.body.userData;
    const filePath = path.join(__dirname, '..', 'user_data', 'data.json');
    const userData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // console.log(userData);
    const { userPrompt } = req.body;
    // console.log(userPrompt);

    try {
        const userFinancialData = userData;

        const response = await chatbot.handleUserQuery(
            userFinancialData,
            userPrompt
        );

        console.log("Bot Response:", response["response"]);
        res.json({ botResponse: response["response"] });

    } catch (error) {
        console.log("Error handling user query:", error);
        res.json({ err: error.message });

    }
};


module.exports = {
    renderChatUI,
    getChatResponse,
}