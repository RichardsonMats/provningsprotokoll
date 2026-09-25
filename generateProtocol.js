import { readFile, writeFile } from "node:fs/promises";
import { searchProducts } from "./systembolaget_api/client.js";
import { createSystembolagetProduct } from "./systembolaget_api/RetailItem.js";

const COLUMN_LABELS = {
    image: "Bild", brand: "Marke", item: "Produkt", country: "Ursprungsland",
    category: "Kategori", abv: "Alkohol", bitterness: "Beska", body: "Fyllighet", sweetness: "Sotma",
    taste: "Smakbeskrivning", comments: "Egna anteckningar",
};

const { articleNumbers: commandLineArticleNumbers, configPath, inputPath, outputPath } = parseArguments(process.argv.slice(2));
const articleNumbers = inputPath
    ? [...await readArticleNumbers(inputPath), ...commandLineArticleNumbers]
    : commandLineArticleNumbers;

if (articleNumbers.length === 0) {
    console.error("Usage: node generateProtocol.js [--input articles.txt] [--config config.json] [--output file.html] <article-number> [...]");
    process.exitCode = 1;
} else {
    const config = await readConfig(configPath);
    const lookups = await Promise.all(articleNumbers.map(async (articleNumber) => ({
        articleNumber,
        product: await findProduct(articleNumber),
    })));
    const missingArticleNumbers = lookups
        .filter(({ product }) => product === null)
        .map(({ articleNumber }) => articleNumber);

    if (missingArticleNumbers.length > 0) {
        throw new Error(`Could not find article number(s): ${missingArticleNumbers.join(", ")}.`);
    }

    const products = lookups.map(({ product }) => product);
    await writeFile(outputPath, await renderDocument(products, config), "utf8");
    console.log(`Created ${outputPath} with ${products.length} item(s).`);
}

function parseArguments(args) {
    let configPath = "protocol.config.json";
    let inputPath = null;
    let outputPath = "provningsprotokoll.html";
    const articleNumbers = [];
    for (let index = 0; index < args.length; index++) {
        if (args[index] === "--config") configPath = args[++index];
        else if (args[index] === "--input") inputPath = args[++index];
        else if (args[index] === "--output") outputPath = args[++index];
        else articleNumbers.push(args[index]);
    }
    return { articleNumbers, configPath, inputPath, outputPath };
}

async function readArticleNumbers(inputPath) {
    const contents = await readFile(inputPath, "utf8");
    return contents
        .split(/\r?\n/)
        .map((line) => line.split("#", 1)[0].trim())
        .filter((line) => line !== "");
}

async function readConfig(configPath) {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (!Array.isArray(config.columns) || config.columns.some(({ key, label, bold, italic }) => !COLUMN_LABELS[key] || (label != null && typeof label !== "string") || (bold != null && typeof bold !== "boolean") || (italic != null && typeof italic !== "boolean"))) {
        throw new Error(`Invalid columns in ${configPath}. Use: ${Object.keys(COLUMN_LABELS).join(", ")}.`);
    }
    const percentageWidths = config.columns.map(({ width }) => typeof width === "string" && width.trim().endsWith("%") ? Number.parseFloat(width) : Number.NaN);
    if (percentageWidths.every(Number.isFinite) && Math.abs(percentageWidths.reduce((total, width) => total + width, 0) - 100) > 0.01) {
        console.warn("Column widths do not total 100%; the browser will scale them proportionally to fill the table.");
    }
    return config;
}

async function findProduct(articleNumber) {
    const requested = String(articleNumber).trim();
    const rawProducts = await searchProducts(requested, { size: 30 });
    const raw = rawProducts.find((product) =>
        String(product.productNumber) === requested ||
        String(product.productNumberShort) === requested ||
        String(product.productId) === requested,
    );

    return raw ? createSystembolagetProduct(raw) : null;
}

async function renderDocument(products, config) {
        const rows = await Promise.all(products.map((product) => renderRow(product, config)));
        const headers = config.columns.map(({ key, label }, index) => `<th class="column-${index}">${escapeHtml(label ?? COLUMN_LABELS[key])}</th>`).join("");
        const columnTypography = config.columns.map(({ bold, italic }, index) => `td.column-${index} { font-style: ${italic ? "italic" : "normal"}; font-weight: ${bold ? "700" : "normal"}; }`).join(" ");
    return `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Provningsprotokoll</title>
  <style>
                @font-face { font-family: bolagetMediumCondensed; src: url("https://www.systembolaget.se/_next/static/media/Bolaget_MediumCondensed-s.p.0jeiiamejpklb.woff2") format("woff2"); }
                @font-face { font-family: interVariable; src: url("https://www.systembolaget.se/_next/static/media/InterVariable-s.p.1m0tgkv8un49s.woff2") format("woff2"); font-weight: 400 600; }
        @page { size: ${config.page.size} ${config.page.orientation}; margin: ${config.page.margin}; }
    * { box-sizing: border-box; }
        html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { background: ${config.colors.page}; color: ${config.colors.text}; font-family: ${config.body.fontFamily}; margin: 0; }
    table { border: 1px solid ${config.colors.tableBorder}; border-collapse: separate; border-spacing: 0; table-layout: fixed; width: 100%; }
        th, td { border: 0; border-left: 1px solid ${config.colors.columnDivider}; border-top: 1px solid ${config.colors.rowDivider}; overflow-wrap: anywhere; padding: ${config.cell.padding}; text-align: left; vertical-align: top; }
        th:first-child, td:first-child { border-left: 0; } thead th { border-top: 0; }
        th { background: ${config.colors.headerBackground}; color: ${config.colors.headerText}; font-family: ${config.header.fontFamily}; font-size: ${config.header.fontSize}; font-style: ${config.header.italic ? "italic" : "normal"}; font-weight: ${config.header.fontWeight}; }
        td { font-size: ${config.body.fontSize}; font-style: ${config.body.italic ? "italic" : "normal"}; height: ${config.rowHeight}; }
        .image-cell { padding: ${config.image.verticalPadding} 0; text-align: center; vertical-align: middle; }
        .product-image { display: block; height: calc(${config.rowHeight} - ${config.image.verticalPadding} - ${config.image.verticalPadding} - 1px); margin: auto; max-width: 100%; object-fit: contain; }
        .flavor-clock { display: block; height: 9.2mm; margin: auto; width: 9.2mm; }
        .comments { background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 7mm, ${config.colors.noteLines} 7.2mm, transparent 7.5mm); }
        ${columnTypography}
        @media print { body { width: 100%; } table { break-inside: avoid; } }
  </style>
</head>
<body>
  <table>
        <colgroup>${config.columns.map(({ width }) => `<col style="width:${escapeAttribute(width)}">`).join("")}</colgroup>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows.join("\n")}</tbody>
  </table>
</body>
</html>`;
}

async function renderRow(product, config) {
    const name = [product.name, product.subtitle].filter(Boolean).join(" ");
    const embeddedImage = product.image ? await embedImage(product.image) : null;
        const values = {
        image: embeddedImage ? `<img class="product-image" src="${embeddedImage}" alt="${escapeAttribute(name)}">` : "-",
                brand: escapeHtml(product.producer ?? "-"), item: escapeHtml(name || "-"), country: escapeHtml(product.country ?? "-"),
                category: escapeHtml(product.category ?? "-"), abv: product.abv == null ? "-" : `${escapeHtml(String(product.abv))} %`,
                bitterness: renderFlavorClock(product, "Beska"), body: renderFlavorClock(product, "Fyllighet"), sweetness: renderFlavorClock(product, "Sotma"),
                taste: escapeHtml(product.taste ?? "-"), comments: "",
        };
        return `<tr>${config.columns.map(({ key }, index) => `<td class="column-${index}${key === "comments" ? " comments" : ""}${key === "image" ? " image-cell" : ""}">${values[key]}</td>`).join("")}</tr>`;
}

async function embedImage(imageUrl) {
        try {
                const response = await fetch(imageUrl);
                if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
                return `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
        } catch (error) {
                console.warn(`Could not embed image from ${imageUrl}: ${error.message}`);
                return null;
        }
}

function renderFlavorClock(product, label) {
    const clock = product.tasteClocks.find((item) => item.label === label);
    if (!clock) return "-";
    return renderClock(clock);
}

function renderClock({ label, value }) {
        const percentage = Math.round((value / 12) * 100);
        const angle = (Math.PI * 2 * percentage) / 100;
        const x = 18 + 16 * Math.sin(angle);
        const y = 18 - 16 * Math.cos(angle);
    const fill = percentage >= 100
        ? `<circle cx="18" cy="18" fill="#355f43" r="16"/>`
        : `<path d="M18 18 L18 2 A16 16 0 ${percentage > 50 ? 1 : 0} 1 ${x} ${y} Z" fill="#355f43"/>`;
    return `<svg class="flavor-clock" viewBox="0 0 36 36" role="img" aria-label="${escapeAttribute(`${label}: ${value} av 12`)}"><circle cx="18" cy="18" fill="#e6e0d8" r="16"/>${fill}</svg>`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function escapeAttribute(value) {
    return escapeHtml(value);
}