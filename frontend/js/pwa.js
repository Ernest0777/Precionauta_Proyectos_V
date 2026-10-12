// Registra el service worker (sw.js): la página se puede instalar como app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Sin service worker la página funciona igual, solo no se instala.
    });
  });
}
