const https = require('https');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { contents } = req.body;
    if (!contents || !Array.isArray(contents)) {
        res.status(400).json({ error: 'Missing contents array' });
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        res.status(500).json({ 
            error: 'Backend API key not configured. Please add your own free Gemini API key in the chat settings (gear icon).' 
        });
        return;
    }

    const RUQYAH_CHAT_SYSTEM = `You are a helpful, spiritual, and compassionate Islamic Ruqyah Healing AI assistant.
Your goal is to guide users in light of the Quran, Sahih Hadith, and teachings of classical and contemporary Islamic scholars (like Ibn Taymiyyah, Ibn al-Qayyim, and respected Raqis).
Guidelines:
1. Ground your answers strictly in orthodox Islamic theology (Ahlus Sunnah wal Jama'ah).
2. Recommend Sunnah protections (Aytul Kursi, Char Qul, Morning/Evening Adhkar, Ajwa dates, Zamzam water, black seed, Sidr leaves).
3. Warn against un-Islamic practices (ta'weez/amulets with numbers/symbols, going to magicians, calling upon Jinns/pirs/saints, slaughtering for other than Allah).
4. Maintain a polite and caring tone. Write primarily in Bengali if the user queries in Bengali, or English if they query in English. Keep answers concise, informative, and formatted with bullet points for readability.
5. REMINDER: Always include a polite disclaimer at the end that Ruqyah is a form of du'a and spiritual healing, and not a replacement for medical or psychological science. If the user presents severe physical/mental symptoms, advise them to consult a qualified medical professional.`;

    const payload = JSON.stringify({
        systemInstruction: {
            parts: [{ text: RUQYAH_CHAT_SYSTEM }]
        },
        contents: contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1200
        }
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const apiRequest = https.request(url, options, (apiResponse) => {
        let responseData = '';
        apiResponse.on('data', (chunk) => { responseData += chunk; });
        apiResponse.on('end', () => {
            if (apiResponse.statusCode >= 200 && apiResponse.statusCode < 300) {
                try {
                    const parsed = JSON.parse(responseData);
                    const reply = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (reply) {
                        res.status(200).json({ reply });
                    } else {
                        res.status(500).json({ error: 'Invalid response structure from Gemini API', details: responseData });
                    }
                } catch (e) {
                    res.status(500).json({ error: 'Failed to parse response from Gemini API', details: responseData });
                }
            } else {
                res.status(apiResponse.statusCode).json({ error: 'Gemini API returned error', details: responseData });
            }
        });
    });

    apiRequest.on('error', (err) => {
        res.status(500).json({ error: 'Proxy request failed', details: err.message });
    });

    apiRequest.write(payload);
    apiRequest.end();
};
