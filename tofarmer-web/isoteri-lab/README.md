# Isoteri Lab — Native Web Demo

Demo ini mempertahankan HTML dan CSS sebagai layer web native, sementara logic aplikasi ditulis di `isoteri-lab.iso`.

## Build bundle

Dari root repository:

```bash
isoteri ekspor-web runtime/web/isoteri-lab/isoteri-lab.iso -o runtime/web/isoteri-lab/isoteri-lab.isoweb.json
```

Setelah file JSON terbentuk, folder ini siap dipublish sebagai static site/GitHub Pages.

JavaScript di `index.html` hanya bootstrap: mengambil bundle, membuat `IsoteriVM`, lalu menjalankannya.
