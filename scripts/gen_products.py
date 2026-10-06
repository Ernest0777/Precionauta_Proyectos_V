"""Genera 100 productos de ejemplo (marcas ficticias) para frontend/js/data/generatedProducts.js."""
import json, random, re, unicodedata

random.seed(20261005)

STORES = [
    ("Amazon México", "AMZ", "https://www.amazon.com.mx"),
    ("Mercado Libre", "ML", "https://www.mercadolibre.com.mx"),
    ("Liverpool", "LIV", "https://www.liverpool.com.mx"),
]

# (nombre base, rango de precio anterior, descripción, specs [(label, [valores])])
CATALOG = {
    "tecnologia": (22, [
        ("Smartphone Nova X{n}", (5999, 13999), "Smartphone con pantalla AMOLED de 6.5\", triple cámara y carga rápida de 33 W.",
         [("Almacenamiento", ["128 GB", "256 GB"]), ("Pantalla", ["6.5\" AMOLED", "6.7\" AMOLED 120 Hz"]), ("Batería", ["5000 mAh", "4500 mAh"])]),
        ("Laptop Vertex {n}", (11999, 21999), "Laptop ligera para trabajo y escuela con SSD rápido y pantalla Full HD.",
         [("Procesador", ["Ryzen 5 7520U", "Ryzen 7 7730U"]), ("Memoria", ["16 GB DDR5", "8 GB DDR4"]), ("Almacenamiento", ["512 GB SSD", "1 TB SSD"])]),
        ("Pantalla Smart TV Lumio {n}\" 4K", (6999, 18999), "Smart TV 4K UHD con HDR10 y apps de streaming integradas.",
         [("Resolución", ["4K UHD"]), ("HDR", ["HDR10", "HDR10+ / Dolby Vision"]), ("Sistema", ["Google TV", "Linux TV"])]),
        ("Tablet Orbit Tab {n} 10.4\"", (3999, 8999), "Tablet para estudio y entretenimiento con bocinas estéreo.",
         [("Pantalla", ["10.4\" 2K", "11\" 90 Hz"]), ("Memoria", ["4 GB + 64 GB", "6 GB + 128 GB"])]),
        ("Smartwatch Pulse Fit {n}", (1499, 4999), "Reloj inteligente con GPS, oxímetro y hasta 10 días de batería.",
         [("GPS", ["Integrado"]), ("Batería", ["Hasta 10 días", "Hasta 14 días"]), ("Resistencia", ["5 ATM"])]),
        ("Audífonos EchoBuds {n} ANC", (999, 3499), "Audífonos in-ear con cancelación activa de ruido y estuche de carga.",
         [("Cancelación de ruido", ["Activa (ANC)"]), ("Autonomía", ["6 h (24 h con estuche)", "8 h (30 h con estuche)"])]),
        ("Monitor ClearView {n}\" 165 Hz", (3499, 7999), "Monitor gamer IPS con 165 Hz y 1 ms de respuesta.",
         [("Tasa de refresco", ["165 Hz", "144 Hz"]), ("Panel", ["IPS", "VA"]), ("Resolución", ["QHD 2560×1440", "Full HD"])]),
        ("Teclado mecánico KeyForge {n}", (899, 2499), "Teclado mecánico RGB con switches intercambiables.",
         [("Switches", ["Rojos lineales", "Azules táctiles"]), ("Conexión", ["USB-C / Bluetooth", "USB-C"])]),
        ("Consola portátil Arcadia {n}", (3999, 7999), "Consola portátil con pantalla de 7\" y miles de juegos retro.",
         [("Pantalla", ["7\" OLED", "7\" IPS"]), ("Almacenamiento", ["64 GB", "128 GB"])]),
        ("Router WiFi 6 Meshlink {n}", (1299, 3499), "Router WiFi 6 de doble banda con cobertura para toda la casa.",
         [("Estándar", ["WiFi 6 AX1800", "WiFi 6 AX3000"]), ("Cobertura", ["Hasta 150 m²", "Hasta 250 m²"])]),
    ]),
    "hogar": (18, [
        ("Refrigerador FrostLine {n} pies", (11999, 24999), "Refrigerador inverter de bajo consumo con despachador de agua.",
         [("Capacidad", ["14 pies", "19 pies"]), ("Tecnología", ["Inverter", "No Frost"])]),
        ("Lavadora AquaPro {n} kg", (7999, 15999), "Lavadora automática de carga superior con 12 ciclos.",
         [("Capacidad", ["18 kg", "20 kg", "22 kg"]), ("Ciclos", ["12", "16"])]),
        ("Licuadora BlendMaster {n}", (899, 2499), "Licuadora de alta potencia con vaso de vidrio y 10 velocidades.",
         [("Potencia", ["1000 W", "1200 W"]), ("Vaso", ["Vidrio 1.5 L", "Tritan 2 L"])]),
        ("Juego de sartenes CasaChef {n} piezas", (999, 2999), "Batería antiadherente libre de PFOA apta para inducción.",
         [("Piezas", ["7", "10", "12"]), ("Recubrimiento", ["Cerámico", "Antiadherente"])]),
        ("Colchón DreamFit Queen {n}", (5999, 14999), "Colchón de espuma viscoelástica con soporte por zonas.",
         [("Tamaño", ["Queen", "King"]), ("Firmeza", ["Media", "Media-firme"])]),
        ("Cafetera de goteo Aroma {n}", (699, 1899), "Cafetera programable de 12 tazas con jarra térmica.",
         [("Capacidad", ["12 tazas"]), ("Programable", ["Sí, 24 h"])]),
        ("Purificador de aire PureBreeze {n}", (1999, 5499), "Purificador con filtro HEPA H13 para espacios de hasta 40 m².",
         [("Filtro", ["HEPA H13"]), ("Área", ["Hasta 40 m²", "Hasta 60 m²"])]),
        ("Horno de microondas WaveCook {n} L", (1799, 3999), "Microondas digital con 10 niveles de potencia y descongelado rápido.",
         [("Capacidad", ["25 L", "31 L"]), ("Potencia", ["900 W", "1100 W"])]),
        ("Ventilador de torre AirFlow {n}", (899, 2299), "Ventilador silencioso con control remoto y temporizador.",
         [("Velocidades", ["3", "4"]), ("Altura", ["105 cm", "120 cm"])]),
    ]),
    "moda": (15, [
        ("Tenis urbanos Stride {n}", (1299, 2999), "Tenis casuales con suela de espuma ligera y tela transpirable.",
         [("Tallas", ["23 a 29 MX"]), ("Material", ["Malla transpirable", "Piel sintética"])]),
        ("Mochila Nómada {n} L", (799, 1999), "Mochila impermeable con compartimento acolchado para laptop de 15.6\".",
         [("Capacidad", ["25 L", "30 L"]), ("Laptop", ["Hasta 15.6\""])]),
        ("Lentes de sol Horizonte {n}", (899, 2499), "Lentes polarizados con protección UV400.",
         [("Protección", ["UV400 polarizado"]), ("Armazón", ["Acetato", "Metal"])]),
        ("Reloj análogo Clásico {n}", (1499, 4999), "Reloj de cuarzo con correa de piel y cristal mineral.",
         [("Movimiento", ["Cuarzo"]), ("Resistencia", ["3 ATM", "5 ATM"])]),
        ("Sudadera Essentials {n}", (599, 1299), "Sudadera de algodón perchado con capucha.",
         [("Material", ["80% algodón"]), ("Tallas", ["CH a XG"])]),
        ("Jeans corte recto Denim {n}", (699, 1599), "Jeans de mezclilla con elastano para mayor comodidad.",
         [("Corte", ["Recto", "Slim"]), ("Material", ["98% algodón, 2% elastano"])]),
        ("Bolsa de mano Verona {n}", (1199, 3499), "Bolsa de piel sintética con compartimentos internos.",
         [("Material", ["Piel sintética"]), ("Cierre", ["Cremallera"])]),
    ]),
    "deportes": (13, [
        ("Caminadora plegable RunHome {n}", (6999, 14999), "Caminadora con motor de 2.5 HP e inclinación automática.",
         [("Motor", ["2.5 HP", "3 HP"]), ("Velocidad máx.", ["14 km/h", "16 km/h"])]),
        ("Set de mancuernas ajustables IronFlex {n} kg", (1999, 5999), "Mancuernas ajustables con selector rápido de peso.",
         [("Peso máx.", ["20 kg", "24 kg"]), ("Ajuste", ["Selector de disco"])]),
        ("Bicicleta fija SpinPro {n}", (4999, 11999), "Bicicleta de spinning con volante de 13 kg y monitor LCD.",
         [("Volante", ["13 kg", "18 kg"]), ("Resistencia", ["Magnética", "Fricción"])]),
        ("Tapete de yoga Balance {n} mm", (399, 999), "Tapete antiderrapante de TPE con correa de transporte.",
         [("Grosor", ["6 mm", "8 mm"]), ("Material", ["TPE"])]),
        ("Balón de fútbol Strike {n}", (399, 1199), "Balón termosellado tamaño 5 para pasto natural y sintético.",
         [("Tamaño", ["5"]), ("Construcción", ["Termosellado"])]),
        ("Casa de campaña Trekker {n} personas", (1499, 4999), "Casa de campaña impermeable de armado rápido.",
         [("Capacidad", ["4 personas", "6 personas"]), ("Impermeabilidad", ["2000 mm", "3000 mm"])]),
    ]),
    "juguetes": (11, [
        ("Pista de autos TurboLoop {n}", (699, 1999), "Pista con loops dobles y lanzador, incluye 2 autos.",
         [("Edad", ["4+ años"]), ("Incluye", ["2 autos"])]),
        ("Muñeca Aurora Aventuras {n}", (499, 1299), "Muñeca articulada con accesorios intercambiables.",
         [("Edad", ["3+ años"]), ("Accesorios", ["12 piezas"])]),
        ("Dron Mini SkyKid {n}", (899, 2499), "Dron para principiantes con cámara HD y modo sin cabeza.",
         [("Cámara", ["720p", "1080p"]), ("Autonomía", ["10 min", "15 min"])]),
        ("Juego de mesa Mercado Loco {n}", (399, 899), "Juego de estrategia familiar para 2 a 6 jugadores.",
         [("Jugadores", ["2 a 6"]), ("Edad", ["8+ años"])]),
        ("Rompecabezas Panorama {n} piezas", (299, 799), "Rompecabezas de cartón grueso con paisajes de México.",
         [("Piezas", ["1000", "1500"]), ("Medida", ["68 × 48 cm"])]),
    ]),
    "autos": (10, [
        ("Llantas Rodamex {n} R15 (par)", (2999, 6999), "Par de llantas para auto compacto con buen agarre en lluvia.",
         [("Medida", ["185/65 R15", "195/60 R15"]), ("Índice de carga", ["88H"])]),
        ("Dashcam RoadEye {n} 2K", (999, 2999), "Cámara para auto con grabación en bucle y visión nocturna.",
         [("Resolución", ["2K", "4K"]), ("Ángulo", ["140°", "170°"])]),
        ("Aspiradora para auto VacGo {n}", (499, 1499), "Aspiradora inalámbrica de mano con filtro lavable.",
         [("Potencia", ["120 W", "150 W"]), ("Batería", ["Recargable USB-C"])]),
        ("Cargador inalámbrico para auto MagDock {n}", (399, 1199), "Soporte magnético con carga rápida de 15 W.",
         [("Potencia", ["15 W"]), ("Montaje", ["Rejilla", "Tablero"])]),
        ("Kit de herramientas MotorFix {n} piezas", (899, 2499), "Kit de herramientas con estuche rígido para emergencias.",
         [("Piezas", ["86", "120"]), ("Estuche", ["Rígido"])]),
    ]),
    "supermercado": (11, [
        ("Café en grano Altura Chiapas {n} kg", (399, 999), "Café 100% arábica de altura, tueste medio.",
         [("Peso", ["1 kg"]), ("Tueste", ["Medio", "Oscuro"])]),
        ("Paquete de detergente LimpiaMax {n} L", (299, 699), "Detergente líquido concentrado para 80 cargas.",
         [("Contenido", ["5 L", "8 L"]), ("Cargas", ["80", "120"])]),
        ("Aceite de oliva extra virgen Olivar {n}", (249, 599), "Aceite de oliva extra virgen de primera extracción en frío.",
         [("Contenido", ["1 L", "2 L"])]),
        ("Pañales Suavecito etapa {n} (paquete)", (499, 1099), "Paquete jumbo de pañales hipoalergénicos.",
         [("Etapa", ["3", "4", "5"]), ("Piezas", ["96", "120"])]),
        ("Croquetas Huellitas adulto {n} kg", (699, 1599), "Alimento seco para perro adulto con proteína de pollo.",
         [("Peso", ["15 kg", "20 kg"])]),
    ]),
}

NAMES_SEEN = set()

def slugify(text):
    text = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")

def price9(value):
    return max(49, int(round(value / 10.0)) * 10 - 1)

products = []
for cat, (count, templates) in CATALOG.items():
    for i in range(count):
        name_t, (lo, hi), desc, specs_t = templates[i % len(templates)]
        n = {"tecnologia": random.choice([5, 7, 8, 9, 11, 12, 14]),
             }.get(cat, random.choice([2, 3, 4, 5, 6, 8, 10]))
        if "\"" in name_t and "Pantalla" in name_t:
            n = random.choice([43, 50, 55, 65])
        elif "pies" in name_t:
            n = random.choice([14, 17, 19])
        elif " kg" in name_t and cat == "hogar":
            n = random.choice([18, 20, 22])
        elif "Monitor" in name_t:
            n = random.choice([24, 27, 32])
        elif "mm" in name_t:
            n = random.choice([6, 8])
        elif "piezas" in name_t and cat == "juguetes":
            n = random.choice([1000, 1500])
        elif "piezas" in name_t:
            n = random.choice([86, 120, 7, 10])
        elif "personas" in name_t:
            n = random.choice([4, 6])
        elif "etapa" in name_t:
            n = random.choice([3, 4, 5])
        elif "mancuernas" in name_t:
            n = random.choice([20, 24, 32])
        elif "Croquetas" in name_t:
            n = random.choice([15, 20])
        elif " kg" in name_t:
            n = random.choice([1, 2])
        elif "microondas" in name_t:
            n = random.choice([25, 31])
        elif "detergente" in name_t:
            n = random.choice([5, 8])
        elif " L" in name_t:
            n = random.choice([25, 30])
        name = name_t.replace("{n}", str(n))
        suffix = ""
        while (name + suffix) in NAMES_SEEN:
            suffix = f" ({random.choice(['Negro', 'Gris', 'Azul', 'Blanco', 'Edición 2026'])})"
        name = name + suffix
        NAMES_SEEN.add(name)

        store, code, url = random.choice(STORES)
        previous = price9(random.uniform(lo, hi))
        # Mayoría 25-60%; algunas "error de precio" 70-88%.
        disc = random.uniform(0.7, 0.88) if random.random() < 0.08 else random.uniform(0.25, 0.6)
        current = price9(previous * (1 - disc))
        hist_min = price9(current * random.uniform(0.92, 1.15))
        hist_max = price9(previous * random.uniform(1.0, 1.08))
        specs = [{"label": label, "value": random.choice(values)} for label, values in specs_t]
        products.append({
            "id": slugify(name),
            "name": name,
            "categorySlug": cat,
            "store": store,
            "storeCode": code,
            "storeUrl": url,
            "previousPrice": previous,
            "currentPrice": current,
            "historicMinPrice": hist_min,
            "historicMaxPrice": hist_max,
            "checkedHoursAgo": random.randint(1, 4),
            "verified": True,
            "description": desc,
            "specs": specs,
        })

ids = [p["id"] for p in products]
assert len(ids) == len(set(ids)), "ids duplicados"

out = '''/**
 * 100 productos de EJEMPLO generados (marcas ficticias) para probar el
 * catálogo, la paginación, la búsqueda y las recomendaciones con volumen
 * real. Precios y descuentos son ilustrativos. Se regeneran con
 * scripts/gen_products.py; no editar a mano.
 */

export const GENERATED_PRODUCTS = ''' + json.dumps(products, ensure_ascii=False, indent=2) + ";\n"
path = r"C:\\Users\\narva\\OneDrive\\Documentos\\GITHUB\\Precionauta_Proyectos_V\\frontend\\js\\data\\generatedProducts.js"
open(path, "w", encoding="utf-8").write(out)
print(len(products), "productos;", sum(1 for p in products if (p["previousPrice"]-p["currentPrice"])/p["previousPrice"] >= 0.7), "con 70%+")
