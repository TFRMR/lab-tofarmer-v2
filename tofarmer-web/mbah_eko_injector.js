(function () {
    console.log("🧬 [Mbah Eko - LIVING AI MODE ACTIVATED]");

    const URL_RESMI = "https://tofarmer-api.tofarmer-api.workers.dev/ai-saran";
    const BOT_USERNAME = "@mbah_eko";

    // =========================
    // 🧠 MEMORY LAYER
    // =========================
    const memory = {
        postMemory: new Map(), // postId -> last hash
        styleMemory: new Map(), // postId -> last style
        cooldown: 8000
    };

    let active = false;
    let throttleLevel = 1;

    // =========================
    // 🧬 STYLE VARIATION ENGINE
    // =========================
    const styles = [
        "santai dan ringan",
        "reflektif mendalam",
        "sedikit bercanda",
        "teknis tapi sederhana"
    ];

    function pickStyle(postId) {
        const prev = memory.styleMemory.get(postId);
        let next = styles[Math.floor(Math.random() * styles.length)];

        if (next === prev) {
            next = styles[(Math.random() * styles.length) | 0];
        }

        memory.styleMemory.set(postId, next);
        return next;
    }

    // =========================
    // 🧯 THROTTLE SYSTEM
    // =========================
    function getDelay() {
        const base = memory.cooldown;
        const jitter = Math.random() * 4000;
        return base * throttleLevel + jitter;
    }

    function increaseThrottle() {
        throttleLevel = Math.min(throttleLevel + 0.1, 3);
    }

    function decreaseThrottle() {
        throttleLevel = Math.max(throttleLevel - 0.05, 1);
    }

    // =========================
    // 🔥 MAIN DETECTOR
    // =========================
    async function scan() {
        if (active) return;

        const posts = document.querySelectorAll(
            "#feed .post, #userPosts .post, .post, #profilePosts .post, [id^='post-card-']"
        );

        for (const post of posts) {

            const postId =
                post.getAttribute("data-id") ||
                post.id?.replace("post-card-", "") ||
                post.id;

            if (!postId) continue;

            const text =
                post.querySelector(".text, .deskripsi-proses")?.innerText || "";

            const comments = post.querySelectorAll(
                "[data-comment-author], .comment-item, .comment-box p, .comment-text"
            );

            let last = null;

            comments.forEach((c) => {
                const a =
                    c.getAttribute("data-comment-author") ||
                    c.querySelector(".comment-author")?.innerText ||
                    "";

                const t = (c.innerText || "").trim();
                if (!t) return;

                last = { author: a, text: t };
            });

            const lastText = last?.text || "";
            const lastAuthor = (last?.author || "").toLowerCase();

            const isMention = lastText.toLowerCase().includes(BOT_USERNAME);
            const isBot = lastAuthor.includes("mbah_eko");

            const hash = btoa(lastText + lastAuthor).substring(0, 10);

            const prevHash = memory.postMemory.get(postId);

            // =========================
            // 🧠 MEMORY CHECK
            // =========================
            if (prevHash === hash) continue;

            let trigger = false;
            let priority = 1;

            if (isMention && !isBot) {
                trigger = true;
                priority = 10;
            } else if (!prevHash) {
                trigger = true;
                priority = 3;
            }

            if (!trigger) continue;

            memory.postMemory.set(postId, hash);

            queue.push({
                postId,
                text,
                lastText,
                lastAuthor,
                priority,
                style: pickStyle(postId)
            });
        }

        runScheduler();
    }

    // =========================
    // 📦 QUEUE SYSTEM
    // =========================
    const queue = [];

    async function runScheduler() {
        if (active) return;
        if (!queue.length) return;

        active = true;

        queue.sort((a, b) => b.priority - a.priority);

        const task = queue.shift();

        try {
            await process(task);
            decreaseThrottle();
        } catch (e) {
            console.error("AI error:", e);
            increaseThrottle();
        }

        const delay = getDelay();

        setTimeout(() => {
            active = false;
            runScheduler();
        }, delay);
    }

    // =========================
    // ⚙️ PROCESSOR
    // =========================
    async function process(task) {
        console.log("🧠 Living AI processing:", task.postId);

        const prompt = `
Kamu adalah @mbah_eko.

Gaya: ${task.style}

Post: ${task.text}
Komentar terakhir: ${task.lastText}
`;

        const reply = await callAI(prompt);

        if (!reply || !window.supabaseClient) return;

        const { error } = await window.supabaseClient
            .from("comments")
            .insert([
                {
                    post_id: parseInt(task.postId),
                    user_id: "LBG52IZRX237FPXOBDKVR2VQFSAROCUKEQVTXITV4SWMZTHPKYQ23MKICY",
                    comment: reply
                }
            ]);

        if (!error) {
            console.log("✅ Living reply sent");
            window.loadFeed?.();
        }
    }

    // =========================
    // 🤖 AI CALL
    // =========================
    async function callAI(prompt) {
        try {
            const res = await fetch(URL_RESMI, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: "komentar",
                    prompt,
                    teks: prompt
                })
            });

            const json = await res.json();
            return json.saran || json.reply || "";
        } catch {
            return "";
        }
    }

    // =========================
    // 👁️ OBSERVER
    // =========================
    const observer = new MutationObserver(scan);

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    setTimeout(scan, 3000);

    window.addEventListener("load", () => {
        setTimeout(scan, 2000);
    });
})();