# Isoteri Native Web Demo

Demo ini sengaja memakai HTML dan CSS untuk hal yang memang merupakan pekerjaan HTML/CSS, tetapi mencoba memindahkan sebanyak mungkin perilaku aplikasi dari JavaScript ke Isoteri.

## Pembagian tanggung jawab

- HTML: shell dan mount point `#app`.
- CSS: seluruh visual/layout/responsive design.
- JavaScript: **hanya bootstrap** `isoteri-vm.js` dan memuat bundle.
- Isoteri: state, component, DOM, event, routing, localStorage, timer, filter, modal, theme toggle, task CRUD.

## Build

Dari root repository:

```bash
isoteri ekspor-web runtime/web/demo_isoteri_native/demo.iso -o runtime/web/demo_isoteri_native/demo.isoweb.json
```

Lalu sajikan folder `runtime/web` lewat HTTP server:

```bash
python3 -m http.server 8080
```

Buka:

```text
http://localhost:8080/demo_isoteri_native/
```

Jangan membuka `index.html` langsung dengan `file://`, karena bundle dimuat melalui `fetch()`.
