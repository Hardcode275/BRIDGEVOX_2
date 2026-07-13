/**
 * Servicio de traducción utilizando OpenAI API
 */

function shouldTranslate(text) {
  if (!text) return false;
  // Traducir si tiene contenido de texto real (letras o números)
  return /[a-zA-Z0-9]/.test(text);
}

async function translate(text, fromLang, toLang, contextBuffer = '', socketId = '') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(`[${socketId}] Warning: OPENAI_API_KEY no configurado. Retornando texto original.`);
    return text;
  }

  // Mapeo de códigos de idioma simples
  const langNames = {
    en: 'inglés',
    es: 'español',
    fr: 'francés',
    de: 'alemán',
    it: 'italiano',
    pt: 'portugués',
  };

  const fromLangName = langNames[fromLang] || fromLang;
  const toLangName = langNames[toLang] || toLang;

  const messages = [
    {
      role: 'system',
      content: `Eres un traductor experto en tiempo real de ${fromLangName} a ${toLangName}.
Traduce el texto que te proporcione el usuario de forma natural y precisa.
${contextBuffer ? `Usa el siguiente contexto previo de la conversación para dar coherencia a la traducción: "${contextBuffer}"` : ''}
IMPORTANTE: Devuelve ÚNICAMENTE la traducción directa, sin explicaciones, sin comillas adicionales y sin preámbulos.`
    },
    {
      role: 'user',
      content: text
    }
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errText}`);
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim();
    console.log(`[${socketId}] OpenAI Translation: "${text}" -> "${translatedText}"`);
    return translatedText || text;
  } catch (error) {
    console.error(`[${socketId}] Error en traducción OpenAI:`, error);
    throw error;
  }
}

module.exports = {
  shouldTranslate,
  translate
};
