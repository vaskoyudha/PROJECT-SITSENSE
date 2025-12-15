const getAdvice = async (req, res) => {
    try {
        const { system, prompt, generationConfig } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ message: 'Gemini API key not configured on server' });
        }

        const model = 'gemini-1.5-flash'; // Or make it configurable
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction: system ? { role: 'system', parts: [{ text: system }] } : undefined,
            generationConfig: generationConfig || { temperature: 0.7, maxOutputTokens: 256 }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API error:', errorData);
            return res.status(response.status).json({ message: 'Error from Gemini API', error: errorData });
        }

        const data = await response.json();

        // Extract text for convenience, but also return full data
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;

        res.json({ text, raw: data });
    } catch (error) {
        console.error('Get advice error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { getAdvice };
