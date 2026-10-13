// ====================================================================
// KAMUS BESAR SEMESTA PEWAYANGAN NUSANTARA (VERSI LENGKAP & EKSTENSIF)
// Mencakup: Amarta (Tua/Muda), Ngastina (Tua/Muda), Kahyangan, Resi, & Dewi
// ====================================================================

const DATABASE_WAYANG_LENGKAP = {

  // ==========================================
  // I. PARA DEWA, BATARA, & RESI SEPUH (PENGAYOM)
  // ==========================================
  antaboga: {
    id: "antaboga",
    nama: "Sang Hyang Antaboga",
    gelar: "Penguasa Saptapratala & Penjaga Akar / Fondasi",
    minNeptu: 7, maxNeptu: 13,
    wukuSesuai: ["Watugunung", "Sinta", "Landep", "Gumbreg"],
    gambar: "https://pdwi.senawangi.org/wp-content/uploads/2025/03/WhatsApp-Image-2025-03-10-at-11.26.34.jpeg",
    deskripsi: "Berakar di kedalaman, tenang, menjadi sumber Tirta Amerta (penyembuhan/kehidupan), tidak silau panggung, dan merawat fondasi jangka panjang.",
    pedoman: "Tetaplah menjadi akar yang menopang pohon dan mata air di balik batu."
  },
  semar: {
    id: "semar",
    nama: "Sang Hyang Ismaya (Semar Badranaya)",
    gelar: "Pamomong Jagad & Guru Sejati Kemanusiaan",
    minNeptu: 7, maxNeptu: 18,
    wukuSesuai: ["Tambir", "Wuye", "Watugunung", "Sinta"],
    gambar: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3c/Wayang_Kulit_of_Semar_crop.jpg/250px-Wayang_Kulit_of_Semar_crop.jpg?utm_source=id.wikipedia.org&utm_campaign=parser&utm_content=thumbnail",
    deskripsi: "Wujud dewa tertinggi yang merendah menjadi abdi. Bijaksana tanpa menggurui, momong dengan ketulusan mutlak, penuntun jiwa yang tersesat.",
    pedoman: "Mulyo tanpa puji, menang tanpa ngasorake (mulia tanpa dipuji, menang tanpa merendahkan)."
  },
  guru: {
    id: "guru",
    nama: "Batara Guru (Sang Hyang Manikmaya)",
    gelar: "Penguasa Tertinggi Kahyangan Tri Lokana",
    minNeptu: 12, maxNeptu: 18,
    wukuSesuai: ["Wukir", "Sungsang", "Galungan"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/4/45/Batara_Guru_wayang.jpg",
    deskripsi: "Penguasa berkuasa penuh yang memiliki wibawa besar namun kadang diuji oleh kealpaan duniawi. Melambangkan kekuasaan, hukum kosmis, dan putusan tertinggi.",
    pedoman: "Kebijaksanaan tertinggi menuntut keseimbangan antara keadilan dan welas asih."
  },
  narada: {
    id: "narada",
    nama: "Batara Narada",
    gelar: "Penasihat Agung Kahyangan & Pustaka Hidup Semesta",
    minNeptu: 10, maxNeptu: 16,
    wukuSesuai: ["Tolu", "Julungwangi", "Kulawu"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/a/ae/Batara_Narada.jpg",
    deskripsi: "Dewa berbadan pendek gempal namun memiliki ilmu seluas samudera, cerdas, kritis, dan menjadi jembatan penghubung antara para dewa dan manusia.",
    pedoman: "Kritik yang tajam berakar dari kepedulian yang mendalam."
  },
  dewadaru: {
    id: "dewadaru",
    nama: "Resi Bisma (Dewabrata)",
    gelar: "Maharesi Sepuh & Kesatria Sumpah Setia",
    minNeptu: 11, maxNeptu: 17,
    wukuSesuai: ["Wukir", "Kurantil", "Mandhasiya"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Bisma_wayang.JPG",
    deskripsi: "Manusia berilmu tinggi dengan sumpah wadat (bujang seumur hidup) demi negara. Bijaksana, tak terkalahkan di medan perang, dan memegang teguh kehormatan.",
    pedoman: "Kehormatan dan sumpah adalah napas hidup seorang kesatria."
  },
  durna: {
    id: "durna",
    nama: "Resi Drona (Dorowati)",
    gelar: "Guru Besar Militer Dinasti Kurawa & Pandawa",
    minNeptu: 9, maxNeptu: 15,
    wukuSesuai: ["Wariga", "Warigagung", "Manahil"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/3/3d/Durna_wayang.JPG",
    deskripsi: "Ahli strategi dan guru olah kanuragan paling ulung. Menguasai berbagai ilmu senjata tingkat tinggi, namun terkadang terikat oleh dilema loyalitas politik kekuasaan.",
    pedoman: "Ilmu tanpa landasan moral batin akan tersesat di ujung jalan."
  },
  shinta_resi: {
    id: "shinta_resi",
    nama: "Begawan Abyasa (Wiyata)",
    gelar: "Maharesi Keturunan Agung & Penulis Epos Jati",
    minNeptu: 8, maxNeptu: 14,
    wukuSesuai: ["Marakeh", "Pahang", "Dukut"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/c/c1/Abiyasa_wayang.JPG",
    deskripsi: "Sesepuh agung yang menjadi paku bumi spiritual Astina-Amarta. Tenang, penuh nubuat, penyabar, dan menjadi tempat meminta petuah di kala krisis.",
    pedoman: "Ketenangan batin adalah mercusuar di tengah badai perpecahan."
  },

  // ==========================================
  // II. KELUARGA PANDAWA & AMARTA (TUA & MUDA)
  // ==========================================
  yudistira: {
    id: "yudistira",
    nama: "Prabu Puntadewa (Yudistira)",
    gelar: "Raja Darmawangsa & Lambang Kejujuran Suci",
    minNeptu: 7, maxNeptu: 13,
    wukuSesuai: ["Mandhasiya", "Julungpujut", "Pahang", "Marakeh"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Yudistira_wayang_kulit.jpg",
    deskripsi: "Sabar luar biasa, berdarah dingin dalam menghadapi ketidakadilan, memegang teguh moralitas, berdarah putih (suci), dan tidak pernah berdusta.",
    pedoman: "Kemenangan sejati adalah kemenangan yang berakar pada kesucian Dharma."
  },
  bima: {
    id: "bima",
    nama: "Prabu Werkudara (Bima)",
    gelar: "Satria Bayuputra & Pencari Hakikat Sejati",
    minNeptu: 14, maxNeptu: 18,
    wukuSesuai: ["Wukir", "Sungsang", "Maktal", "Dukut"],
    gambar: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/Werkodara_of_Bima%2C_KITLV_36C86.tiff/lossy-page1-960px-Werkodara_of_Bima%2C_KITLV_36C86.tiff.jpg",
    deskripsi: "Jujur mutlak, berpendirian baja, tidak bisa berbasa-basi pada kepalsuan, kasar di luar namun lembut berbakti, gigih mencari jatidiri spiritual tertinggi.",
    pedoman: "Luruskan niat, tegakkan kebenaran tanpa keraguan."
  },
  arjuna: {
    id: "arjuna",
    nama: "Raden Janaka (Arjuna / Parta)",
    gelar: "Satria Madusatra & Penembah Kesucian Batin",
    minNeptu: 8, maxNeptu: 15,
    wukuSesuai: ["Kurantil", "Wariga", "Warigagung", "Manahil"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/5/5a/Arjuna_wayang_kulit.jpg",
    deskripsi: "Berbudi halus, tampan rupawan, sangat tekun dalam pertapaan/fokus ilmu, penjelajah keindahan estetika, kesatria pemanah ulung dan olah batin tajam.",
    pedoman: "Fokuskan cipta, rasa, dan karsa pada kesucian tujuan."
  },
  nakula_sadewa: {
    id: "nakula_sadewa",
    nama: "Raden Nakula & Sadewa",
    gelar: "Pendekar Kembar Penguasa Medis & Ketelitian",
    minNeptu: 9, maxNeptu: 14,
    wukuSesuai: ["Tolu", "Gumbreg", "Langkir"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/8/8c/Nakula_Sadewa.jpg",
    deskripsi: "Teliti, menguasai ilmu pengobatan (ayurveda/husada), waspada, setia kawan, serta menjaga harmoni dan keseimbangan batin dalam kelompok.",
    pedoman: "Ketelitian dan welas asih adalah obat bagi segala kekacauan."
  },
  antareja: {
    id: "antareja",
    nama: "Raden Antareja",
    gelar: "Satria Tahan Banting & Pekerja Hening",
    minNeptu: 11, maxNeptu: 16,
    wukuSesuai: ["Watugunung", "Kuruwelut", "Wugu", "Wayang"],
    gambar: "https://encrypted-tbn2.gstatic.com/licensed-image?q=tbn:ANd9GcQIfipsK2iA4oUtcfXjc3pfV27uJXx1xW-NQrUQx8fOGvxOZh9zoc1l78I44k-hha-1gdWT8IAIuw5pK7s",
    deskripsi: "Tahan banting menghadapi ujian hidup, bergerak senyap menembus kebuntuan (*ambles bumi*), jujur, dan rela berkorban demi hasil akhir.",
    pedoman: "Kesaktian sejati lahir dari kerendahan hati dan ketabahan memikul beban."
  },
  gatotkaca: {
    id: "gatotkaca",
    nama: "Raden Gatotkaca",
    gelar: "Satria Otot Kawat Tulang Besi & Pahlawan Pringgandani",
    minNeptu: 13, maxNeptu: 18,
    wukuSesuai: ["Prangbakat", "Bala", "Wuyu"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/2/22/Gatotkaca_wayang_kulit.jpg",
    deskripsi: "Berani terbang tinggi melintasi batas, penuh daya juang, pelindung di udara, berjiwa patriotik yang siap gugur demi kehormatan negara.",
    pedoman: "Keberanian terbang menembus badai adalah takdir seorang pembela."
  },
  abimanyu: {
    id: "abimanyu",
    nama: "Raden Abimanyu (Angkawijaya)",
    gelar: "Satria Panatas Praja & Simbol Kesatria Muda Berbudi",
    minNeptu: 9, maxNeptu: 14,
    wukuSesuai: ["Sinta", "Landep", "Tambir"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/9/91/Abimanyu_wayang.JPG",
    deskripsi: "Berhati bersih, dicintai banyak pihak, pemberani walau berada di situasi paling terjepit, melambangkan generasi muda penuh idealisme.",
    pedoman: "Ketulusan niat melahirkan keberanian tanpa batas."
  },
  wisanggeni: {
    id: "wisanggeni",
    nama: "Raden Wisanggeni",
    gelar: "Satria Pemberontak Suci & Penembus Batas Langit",
    minNeptu: 15, maxNeptu: 18,
    wukuSesuai: ["Sungsang", "Maktal", "Dukut"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/0/07/Wisanggeni_wayang.JPG",
    deskripsi: "Berwatak blak-blakan, tidak mengenal tata krama feodal kahyangan jika itu tidak adil, sangat sakti mandraguna, pelindung kaum tertindas yang berjiwa bebas.",
    pedoman: "Kebenaran mutlak tidak boleh tunduk pada birokrasi kesombongan."
  },

  // ==========================================
  // III. KELUARGA KRAWA & NGASTINA (TUA & MUDA)
  // ==========================================
  dhistarastra: {
    id: "dhistarastra",
    nama: "Prabu Drestarasta",
    gelar: "Raja Sepuh Astina & Simbol Keterbatasan Keadilan",
    minNeptu: 8, maxNeptu: 13,
    wukuSesuai: ["Wuye", "Kulawu", "Pahang"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/5/58/Drestarasta_wayang.JPG",
    deskripsi: "Raja tuna netra fisik yang hatinya sering kali dibutakan oleh rasa sayang berlebihan kepada keturunannya. Melambangkan dilema objektivitas pemimpin.",
    pedoman: "Kepemimpinan yang adil menuntut mata hati yang terbuka melampaui ikatan darah."
  },
  duryudana: {
    id: "duryudana",
    nama: "Prabu Suyudana (Duryudana)",
    gelar: "Raja Agung Ngastina & Simbol Ambisi Kekuasaan",
    minNeptu: 11, maxNeptu: 17,
    wukuSesuai: ["Maktal", "Prangbakat", "Wugu"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/9/94/Duryudana_wayang.JPG",
    deskripsi: "Tegas, gigih mempertahankan hak kekuasaan kerajaannya, setia kawan kepada sekutu (seperti Karna), namun dikuasai oleh ambisi dan rasa iri.",
    pedoman: "Kehormatan takhta harus dibela sampai titik darah penghabisan."
  },
  sengkuni: {
    id: "sengkuni",
    nama: "Patih Haryo Sengkuni (Trical)",
    gelar: "Ahli Strategi Licik & Arsitek Intrik Politik",
    minNeptu: 10, maxNeptu: 16,
    wukuSesuai: ["Medangkungan", "Wayang", "Kulawu"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/3/36/Sengkuni_wayang.JPG",
    deskripsi: "Cerdas luar biasa dalam merancang siasat, provokator ulung, menyimpan dendam masa lalu yang membara untuk meruntuhkan dinasti musuhnya.",
    pedoman: "Siasat dan kesabaran jangka panjang adalah senjata paling mematikan."
  },
  dursasana: {
    id: "dursasana",
    nama: "Raden Dursasana",
    gelar: "Panglima Garang & Eksekutor Agresif Ngastina",
    minNeptu: 13, maxNeptu: 18,
    wukuSesuai: ["Bala", "Wugu", "Watugunung"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/6/67/Dursasana_wayang.JPG",
    deskripsi: "Garang, penurut mutlak kepada titah kakaknya, bertindak tanpa perhitungan panjang di medan laga, melambangkan watak otot tanpa olah rasa.",
    pedoman: "Loyalitas tanpa nalar kritis adalah jalan kehancuran."
  },
  karna: {
    id: "karna",
    nama: "Adipati Karna (Basusena)",
    gelar: "Satria Dermawan & Teladan Kesetiaan pada Janji",
    minNeptu: 11, maxNeptu: 17,
    wukuSesuai: ["Maktal", "Wuye", "Dukut"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/7/77/Karna_wayang.JPG",
    deskripsi: "Sangat dermawan (tak pernah menolak peminta), memegang teguh janji kesetiaan kepada sahabat meski berada di pihak yang keliru, kesatria berhati agung.",
    pedoman: "Menepati janji dan darma bakti adalah harga diri kesatria."
  },

  // ==========================================
  // IV. STRATEGIST & SEKUTU UTAMA
  // ==========================================
  kresna: {
    id: "kresna",
    nama: "Prabu Sri Kresna",
    gelar: "Awatar Strategi & Kebijaksanaan Makro",
    minNeptu: 10, maxNeptu: 18,
    wukuSesuai: ["Julungwangi", "Tolu", "Medangkungan", "Kulawu"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/d/d7/Kresna_wayang.JPG",
    deskripsi: "Diplomat ulung, visioner, tenang di tengah krisis, penguasa Cakra, dan mampu melihat benang merah rumit dalam setiap permasalahan kolektif.",
    pedoman: "Kebijaksanaan adalah kemudi utama dalam merajut harmoni."
  },
  satyaki: {
    id: "satyaki",
    nama: "Raden Satyaki",
    gelar: "Panglima Benteng Utama (Bima Kunthing)",
    minNeptu: 12, maxNeptu: 18,
    wukuSesuai: ["Galungan", "Kuningan", "Prangbakat", "Bala"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/5/59/Setyaka_Wayang.JPG",
    deskripsi: "Tegas, pemberani, lugas, pasang badan di garis depan, setia kawan, dan selalu tuntas menyelesaikan tugas (*ngrampunge gawe*).",
    pedoman: "Keberanian adalah perisai kebenaran yang pantang mundur."
  },

  // ==========================================
  // V. PARA DEWI, BIDADARI, & KESATRIA WANITA
  // ==========================================
  kunthi: {
    id: "kunthi",
    nama: "Dewi Kunthi Talibrata",
    gelar: "Ibu Agung Pandawa & Lambang Ketegaran Wanita Utama",
    minNeptu: 7, maxNeptu: 13,
    wukuSesuai: ["Sinta", "Mandhasiya", "Tambir"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/2/29/Kunti_wayang.JPG",
    deskripsi: "Ibu yang tegar menghadapi cobaan hidup luar biasa, penuh kebijaksanaan batin, mendidik anak-anaknya menjadi pejuang kebenaran sejati.",
    pedoman: "Ketegaran seorang ibu adalah pelindung paling tangguh bagi masa depan anak."
  },
  drupadi: {
    id: "drupadi",
    nama: "Dewi Drupadi (Kresna Dwi)",
    gelar: "Permaisuri Agung Amarta & Simbol Harga Diri Wanita",
    minNeptu: 9, maxNeptu: 15,
    wukuSesuai: ["Kurantil", "Julungpujut", "Wuku"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/6/62/Drupadi_wayang.JPG",
    deskripsi: "Wanita berpendirian baja, cerdas, tidak mudah tunduk pada penindasan, menjadi pemersatu spiritual para Pandawa di masa pembuangan dan perang.",
    pedoman: "Martabat kehormatan tidak boleh ditukar dengan ketakutan."
  },
  srikandi: {
    id: "srikandi",
    nama: "Dewi Srikandi",
    gelar: "Srikandi Perang & Panglima Wanita Tangguh",
    minNeptu: 10, maxNeptu: 16,
    wukuSesuai: ["Wariga", "Warigagung", "Manahil"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/1/1a/Srikandi_wayang.JPG",
    deskripsi: "Pemberani, tangkas, mahir memanah, pelopor emansipasi ketegasan di medan laga, tidak kenal takut menghadapi musuh besar.",
    pedoman: "Ketegasan emansipasi dan keberanian membela kebenaran melampaui batasan apa pun."
  },
  subadra: {
    id: "subadra",
    nama: "Dewi Subadra (Rarasati)",
    gelar: "Permaisuri Arjuna & Lambang Kelembutan Paripurna",
    minNeptu: 7, maxNeptu: 12,
    wukuSesuai: ["Landep", "Tolu", "Gumbreg"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/8/82/Subadra_wayang.JPG",
    deskripsi: "Lemah lembut, sabar, menenangkan suasana rumah tangga yang bergejolak, memiliki ketajaman batin yang dihormati para kesatria besar.",
    pedoman: "Kelembutan yang tulus adalah penenang bagi amarah dunia."
  },
  supraba: {
    id: "supraba",
    nama: "Batari Supraba",
    gelar: "Bidadari Utama Kahyangan Indrapura",
    minNeptu: 11, maxNeptu: 16,
    wukuSesuai: ["Julungwangi", "Sungsang", "Galungan"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/5/5c/Bidadari_wayang.jpg",
    deskripsi: "Melambangkan keindahan estetika, pesona kebaikan, keteguhan menyusup ke sarang musuh demi misi penyelamatan semesta.",
    pedoman: "Keindahan sejati memancarkan daya ketahanan yang melumpuhkan kebatilan."
  },

  // ==========================================
  // VI. PARA PUNAKAWAN & ABDI RAKYAT
  // ==========================================
  petruk: {
    id: "petruk",
    nama: "Kanjeng Kyai Lurah Petruk",
    gelar: "Punakawan Cerdas & Filosof Jenaka",
    minNeptu: 7, maxNeptu: 12,
    wukuSesuai: ["Julungpujut", "Pahang", "Wugu"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Petruk_wayang_kulit.jpg",
    deskripsi: "Kritikus sosial yang cerdas, jenaka, berbadan tinggi panjang (filosofi memandang jauh ke depan), pembela kaum kecil lewat humor dan sindiran tajam.",
    pedoman: "Kebenaran sering kali disampaikan lewat senyuman dan kecerdasan."
  },
  gareng: {
    id: "gareng",
    nama: "Nala Gareng",
    gelar: "Punakawan Waspada & Penuh Kontemplasi",
    minNeptu: 8, maxNeptu: 13,
    wukuSesuai: ["Marakeh", "Medangkungan"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/9/9f/Gareng_wayang.JPG",
    deskripsi: "Cacat fisik namun kaya batin (filosofi tangan cacat mengambil secukupnya, kaki pincang berhati-hati melangkah), sangat waspada dan jujur.",
    pedoman: "Keterbatasan fisik adalah pengingat untuk selalu berhati-hati melangkah."
  },
  bagong: {
    id: "bagong",
    nama: "Bagong",
    gelar: "Punakawan Oposisi Nalar & Pembela Rakyat",
    minNeptu: 10, maxNeptu: 16,
    wukuSesuai: ["Sungsang", "Galungan"],
    gambar: "https://upload.wikimedia.org/wikipedia/commons/b/b5/Bagong_wayang.JPG",
    deskripsi: "Spontan, ceplas-ceplos, berani melawan kemapanan dan kesombongan para penguasa demi membela kebenaran wong cilik.",
    pedoman: "Kejujuran rakyat jelata adalah cermin paling jujur bagi para penguasa."
  }
};

// ====================================================================
// POHON PERTANYAAN INTROSPEKSI BERTINGKAT (FUNGSI PENGERUCUTAN LUAS)
// ====================================================================

const POHON_PERTANYAAN = [
  {
    id: 1,
    soal: "Tahap 1: Ketika Anda menghadapi krisis, masalah rumit, atau konflik besar di lingkungan Anda, apa reaksi naluriah pertama Anda?",
    pilihan: [
      { teks: "Menenangkan diri, merenung di kedalaman, dan merancang fondasi jangka panjang dari balik layar.", arah: ["antaboga", "semar", "dhistarastra", "shinta_resi"] },
      { teks: "Langsung terjun ke lapangan, memikul beban berat sendirian secara senyap sampai tuntas.", arah: ["antareja", "bima", "dursasana"] },
      { teks: "Langsung pasang badan di garis depan, tegas, dan membela kehormatan kelompok secara terbuka.", arah: ["satyaki", "gatotkaca", "srikandi", "duryudana"] },
      { teks: "Menganalisis pola masalah secara luas, menyusun strategi cerdas, dan mencari solusi damai yang elegan.", arah: ["kresna", "arjuna", "narada", "durna"] }
    ]
  },
  {
    id: 2,
    soal: "Tahap 2: Apa bentuk kepuasan atau kebahagiaan terbesar bagi Anda setelah menyelesaikan sebuah karya atau misi?",
    pilihan: [
      { teks: "Sistem, ilmu, atau ajaran yang saya bangun bisa diwariskan dan dihidupkan oleh generasi berikutnya.", arah: ["antaboga", "semar", "dewadaru", "kunthi"] },
      { teks: "Beban rintangan berhasil dijebol dan diselesaikan tuntas tanpa saya peduli pujian orang.", arah: ["antareja", "bima", "gatotkaca", "wisanggeni"] },
      { teks: "Tugas selesai dengan sempurna, kehormatan ditegakkan, dan janji suci terpenuhi.", arah: ["satyaki", "yudistira", "karna", "abimanyu"] },
      { teks: "Terciptanya harmoni, keseimbangan, serta kedamaian bagi orang banyak di sekitar saya.", arah: ["kresna", "arjuna", "subadra", "nakula_sadewa"] }
    ]
  },
  {
    id: 3,
    soal: "Tahap 3: Bagaimana prinsip batin Anda dalam memandang kekuasaan, popularitas, atau pujian publik?",
    pilihan: [
      { teks: "Saya paling nyaman bekerja di balik layar; nama besar tidak penting asalkan substansinya hidup.", arah: ["antaboga", "semar", "petruk", "gareng"] },
      { teks: "Saya apa adanya, tidak suka pencitraan, dan menolak kepalsuan dalam bentuk apa pun.", arah: ["bima", "bagong", "wisanggeni", "antareja"] },
      { teks: "Saya siap memimpin di depan apabila mandat dan tanggung jawab menuntut saya berkorban.", arah: ["satyaki", "duryudana", "gatotkaca", "guru"] },
      { teks: "Saya mendedikasikan hidup untuk menjaga darma, kesetiaan, dan prinsip moral yang luhur.", arah: ["yudistira", "karna", "drupadi", "arjuna"] }
    ]
  }
];