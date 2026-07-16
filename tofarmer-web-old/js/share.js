// ==========================================
// TOFARMER SHARE SYSTEM WITH POP-UP MODAL (FIXED)
// ==========================================

function sharePost(postId, username, textContent) {
  // 1. Bersihkan teks dari spasi berlebih untuk teks pratinjau
  const cleanText = textContent ? textContent.substring(0, 80) + "..." : "Intip karya seru hari ini!";
  
  // 2. Ambil ID profil secara dinamis dari URL saat ini (jika ada)
  const currentUrlParams = new URLSearchParams(window.location.search);
  const currentProfileId = currentUrlParams.get("id") || "";
  
  // 3. Susun URL Link khusus menuju postingan tersebut secara akurat
  let shareUrl = "";
  if (window.location.pathname.includes("profile.html")) {
    shareUrl = `${window.location.origin}${window.location.pathname}?id=${currentProfileId}&post=${postId}`;
  } else {
    shareUrl = `${window.location.origin}${window.location.pathname}?post=${postId}`;
  }
  
  // 4. Susun format teks lengkap untuk dibagikan ke WhatsApp / Media Sosial
  const fullShareText = `🌿 Lihat progres karya dari @${username} di ToFarmer:\n"${cleanText}"\n\nSelengkapnya di: ${shareUrl}`;

  // 5. BIKIN ELEMENT POP-UP (MODAL) SECARA DINAMIS
  const modal = document.createElement("div");
  modal.id = "tofShareModal";
  modal.style = `
    position: fixed;
    inset: 0;
    background: rgba(16, 25, 20, 0.65);
    backdrop-filter: blur(8px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 999999;
    font-family: sans-serif;
    padding: 15px;
  `;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 24px; width: 100%; max-width: 320px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.15); border: 1px solid rgba(76,175,122,0.12);">
      
      <div style="font-size: 40px; margin-bottom: 8px;">🌿</div>
      <div style="font-size: 18px; font-weight: 700; color: #2f6f4e; margin-bottom: 6px;">Bagikan Karya</div>
      <div style="font-size: 12px; color: #6f7f76; margin-bottom: 16px;">Ajak kawan-kawan melihat progres kebun karya dari @${username}</div>

      <div style="display: flex; gap: 6px; margin-bottom: 16px;">
        <input type="text" id="tofShareLinkInput" value="${shareUrl}" readonly style="flex: 1; padding: 10px 12px; font-size: 12px; border: 1px solid #ddd; border-radius: 12px; background: #fafafa; outline: none; color: #555;" />
        <button onclick="copyTofLink()" style="background: #2f6f4e; color: white; border: none; padding: 10px 14px; font-size: 12px; font-weight: 600; border-radius: 12px; cursor: pointer;">
          Salin
        </button>
      </div>

      <div id="tofCopyStatus" style="font-size: 11px; color: #2f6f4e; font-weight: 600; margin-top: -10px; margin-bottom: 12px; display: none;">
        ✅ Link berhasil disalin!
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;">
        
        <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(fullShareText)}" target="_blank" style="text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 6px; background: #25D366; color: white; padding: 12px; border-radius: 12px; font-size: 12px; font-weight: 600; box-shadow: 0 4px 10px rgba(37,211,102,0.15);">
          🟢 WhatsApp
        </a>

      

      </div>

      <button onclick="closeTofShareModal()" style="width: 100%; background: #eee; border: none; color: #666; font-size: 12px; font-weight: 600; cursor: pointer; padding: 10px; border-radius: 12px;">
        ❌ Tutup Tampilan
      </button>

    </div>
  `;

  // Masukkan pop-up ke dalam dokumen web
  document.body.appendChild(modal);
}

// Fungsi internal untuk menyalin teks link di dalam pop-up
function copyTofLink() {
  const copyText = document.getElementById("tofShareLinkInput");
  if (!copyText) return;

  copyText.select();
  copyText.setSelectionRange(0, 99999); // Untuk HP/Mobile

  navigator.clipboard.writeText(copyText.value).then(() => {
    const status = document.getElementById("tofCopyStatus");
    if (status) {
      status.style.display = "block";
      setTimeout(() => {
        if (status) status.style.display = "none";
      }, 2000);
    }
  }).catch(err => {
    console.error("Gagal menyalin: ", err);
  });
}

// Fungsi untuk menutup pop-up
function closeTofShareModal() {
  const modal = document.getElementById("tofShareModal");
  if (modal) {
    modal.remove();
  }
}