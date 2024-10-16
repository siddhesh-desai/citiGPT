const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');

dotenv.config();
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX_NAME;

// Create Index (if not already created)
async function createIndex() {
    try {
        await pc.createIndex({
            name: indexName,
            dimension: 1024,
            metric: 'cosine',
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1',
                },
            },
        });
        console.log(`Index ${indexName} created successfully.`);
    } catch (error) {
        console.error('Error creating index:', error);
    }
}

// Function to fetch data from a website
async function fetchWebsiteData(url) {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        const textContent = $('body').text().trim();
        textContent = textContent.replace(/\t/g, ' ');
        return textContent;
    } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
        return null;
    }
}

// Function to embed and upsert data into Pinecone
async function embedAndUpsert(url, text, namespaceName) {
    const model = 'multilingual-e5-large';
    const vectors = [
        {
            id: url,
            text: text,
        },
    ];

    const embeddings = await pc.inference.embed(
        model,
        vectors.map((d) => d.text),
        { inputType: 'passage', truncate: 'END' }
    );

    const upsertData = vectors.map((d, i) => ({
        id: d.id,
        values: embeddings[i].values,
        metadata: { text: d.text },
    }));

    const index = pc.index(indexName);
    await index.namespace(namespaceName).upsert(upsertData);
    console.log('Data upserted to Pinecone successfully.');
}

// Function to query the Pinecone index
async function queryIndex(queryText, namespaceName) {
    const model = 'multilingual-e5-large';

    const queryEmbedding = await pc.inference.embed(model, [queryText], { inputType: 'query' });

    const index = pc.index(indexName);
    const queryResponse = await index.namespace(namespaceName).query({
        topK: 3,
        vector: queryEmbedding[0].values,
        includeValues: false,
        includeMetadata: true,
    });

    console.log('Query Response:', queryResponse);
}

// Main function to process website and query
async function main(websiteUrl, queryText, namespaceName) {
    await createIndex();

    const textContent = await fetchWebsiteData(websiteUrl);
    if (textContent) {
        await embedAndUpsert(websiteUrl, textContent, namespaceName);
    }

    await queryIndex(queryText, namespaceName);
}

// Example usage
const websiteUrl = 'https://www.online.citibank.co.in/products-services/investments/mutual-funds/mutual-funds.htm?eOfferCode=LFTNVINV';
const queryText = 'How to invest in mutual funds?';
const namespaceName = process.env.PINECONE_INDEX_NAMESPACE;

main(websiteUrl, queryText, namespaceName)
    .then(() => console.log('Process completed successfully.'))
    .catch((error) => console.error('Error during process:', error));
