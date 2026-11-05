const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const source = await readFile(path.join(__dirname, '../frontend/js/utils/images.js'), 'utf8');
  const listeners = [];
  global.document = { addEventListener: (...args) => listeners.push(args) };
  const { productImages, renderProductImage, handleImageError, IMAGE_FALLBACK } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(typeof renderProductImage, 'function', 'Los previews deben reutilizar la imagen del producto');
  const preview = renderProductImage({ name: 'Audífonos "Pro"', image: 'https://example.test/a.jpg?x=1&y=2' }, 'preview-photo');
  assert.match(preview, /<img/);
  assert.match(preview, /data-product-image/);
  assert.match(preview, /a.jpg\?x=1&amp;y=2/);
  assert.match(preview, /Audífonos &quot;Pro&quot;/);
  assert.equal(renderProductImage({ image: null }), '');
  assert.deepEqual(productImages({ images: [], image: 'thumbnail.jpg' }), ['thumbnail.jpg']);
  assert.deepEqual(productImages({ images: [null, 'a.jpg', 'a.jpg', ' '], image: 'b.jpg' }), ['a.jpg', 'b.jpg']);
  assert.deepEqual(productImages({ images: 'bad', image: null }), []);
  assert.equal(listeners[0][0], 'error');
  assert.equal(listeners[0][2], true, 'El error de imagen no hace bubble; debe capturarse');
  const removed = [];
  const img = { tagName: 'IMG', dataset: { imageLabel: 'Audífonos' }, src: 'broken.jpg', alt: '', hasAttribute: () => true, removeAttribute: (name) => removed.push(name), width: 480, height: 480 };
  handleImageError({ target: img });
  assert.equal(img.src, IMAGE_FALLBACK);
  assert.equal(img.alt, 'Imagen no disponible de Audífonos');
  assert.deepEqual(removed, ['srcset']);
  assert.equal(img.width, 480);
  assert.equal(img.height, 480);
  handleImageError({ target: img });
  assert.equal(removed.length, 1, 'No reintenta indefinidamente si falla el fallback');
  const unrelated = { tagName: 'IMG', dataset: {}, src: 'other.jpg', hasAttribute: () => false };
  handleImageError({ target: unrelated });
  assert.equal(unrelated.src, 'other.jpg');
  handleImageError({ target: null });
  console.log('images.test.js: imagen fallida, fallback accesible y thumbnail OK');
  delete global.document;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
