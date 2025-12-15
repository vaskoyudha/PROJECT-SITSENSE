/*
  SitSense — chat-ui.js
  ---------------------------------
  Mengelola interaksi UI untuk chatbot Gemini.
*/

(function () {
    const chatHistory = document.getElementById('chatHistory');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const typingIndicator = document.getElementById('aiTypingIndicator');

    // State untuk menyimpan history percakapan (untuk dikirim ke API)
    let conversationHistory = [];

    // Simple Markdown Formatter
    function formatMarkdown(text) {
        if (!text) return '';

        // Escape HTML first
        let safe = String(text).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

        // Bold: **text** -> <strong>text</strong>
        safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Italic: *text* -> <em>text</em>
        safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Lists: Lines starting with * or - followed by space
        // We handle this by processing line by line
        const lines = safe.split(/\r?\n/);
        let output = '';
        let inList = false;

        lines.forEach(line => {
            const listMatch = line.match(/^(\*|-|\d+\.)\s+(.*)/);
            if (listMatch) {
                if (!inList) {
                    output += '<ul class="list-disc pl-5 space-y-1 my-2">';
                    inList = true;
                }
                output += `<li>${listMatch[2]}</li>`;
            } else {
                if (inList) {
                    output += '</ul>';
                    inList = false;
                }
                // Handle paragraphs (non-empty lines)
                if (line.trim()) {
                    output += `<p class="mb-1">${line}</p>`;
                }
            }
        });

        if (inList) output += '</ul>';

        return output;
    }

    function scrollToBottom() {
        if (chatHistory) {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    }

    function appendMessage(role, text) {
        if (!chatHistory) return;

        const isUser = role === 'user';
        const align = isUser ? 'chat-end' : 'chat-start';
        const bubbleColor = isUser ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-300';
        const avatar = isUser
            ? '<div class="w-8 rounded-full bg-slate-700 p-1"><i data-lucide="user" class="h-full w-full text-slate-300"></i></div>'
            : '<div class="w-8 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-1"><i data-lucide="bot" class="h-full w-full text-purple-300"></i></div>';

        const html = `
      <div class="chat ${align}">
        <div class="chat-image avatar">
          ${avatar}
        </div>
        <div class="chat-bubble ${bubbleColor} text-sm">
          ${formatMarkdown(text)}
        </div>
      </div>
    `;

        chatHistory.insertAdjacentHTML('beforeend', html);

        // Render icons for the new message
        if (window.lucide) window.lucide.createIcons();

        scrollToBottom();
    }

    function showTyping(show) {
        if (typingIndicator) {
            typingIndicator.classList.toggle('hidden', !show);
            scrollToBottom();
        }
    }

    async function handleUserSubmit(e) {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        // Clear input
        chatInput.value = '';

        // Add user message to UI
        appendMessage('user', text);

        // Show typing
        showTyping(true);

        try {
            // Panggil API (via ai-gemini.js)
            // Kita asumsikan ada fungsi baru sendChat di window.SitSenseAI
            // atau kita gunakan getPostureAdvice dengan parameter khusus

            const response = await window.SitSenseAI.sendChat(text, conversationHistory);

            // Hide typing
            showTyping(false);

            if (response && response.text) {
                appendMessage('model', response.text);

                // Update history
                conversationHistory.push({ role: 'user', parts: [{ text: text }] });
                conversationHistory.push({ role: 'model', parts: [{ text: response.text }] });
            } else {
                appendMessage('model', 'Maaf, saya tidak dapat memproses permintaan Anda saat ini.');
            }

        } catch (err) {
            showTyping(false);
            console.error('Chat error:', err);
            appendMessage('model', 'Terjadi kesalahan koneksi. Silakan coba lagi.');
        }
    }

    // Expose function untuk menambahkan pesan sistem (misal dari hasil analisis otomatis)
    window.addSystemMessage = function (text) {
        appendMessage('model', text);
        conversationHistory.push({ role: 'model', parts: [{ text: text }] });
    };

    if (chatForm) {
        chatForm.addEventListener('submit', handleUserSubmit);
    }

    // Initial scroll
    scrollToBottom();

})();
