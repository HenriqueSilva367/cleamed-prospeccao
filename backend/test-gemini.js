require('dotenv').config();
const { OpenAI } = require('openai');
const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });
async function run() {
  try {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Diga oi" }]
    });
    console.log(response.choices[0].message.content.trim());
  } catch (e) {
    console.error(e);
  }
}
run();
