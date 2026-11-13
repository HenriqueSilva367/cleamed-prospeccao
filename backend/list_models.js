require('dotenv').config();
const { OpenAI } = require('openai');

async function run() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("No API KEY");
    return;
  }
  try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.models.list();
      console.log(JSON.stringify(response.data.map(m => m.id), null, 2));
  } catch (e) {
      console.error(e);
  }
}
run();
