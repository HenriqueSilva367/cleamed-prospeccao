require('dotenv').config();
const { OpenAI } = require('openai');

async function test() {
  try {
      const apiKey = process.env.OPENAI_API_KEY;
      console.log("API KEY:", apiKey ? apiKey.substring(0, 10) + "..." : "NULL");
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Diga oi apenas" }]
      });
      console.log("Resposta:", response.choices[0].message.content.trim());
  } catch(e) {
      console.log("ERROR:", e.message);
  }
}
test();
