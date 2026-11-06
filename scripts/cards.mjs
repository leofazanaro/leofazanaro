// Gera cards/stats.svg e cards/languages.svg a partir da API GraphQL do GitHub.
// Sem dependências: só Node 18+ (fetch nativo).
// Uso: GITHUB_TOKEN=... USERNAME=leofazanaro node scripts/cards.mjs

import { writeFileSync, mkdirSync } from "node:fs";

const TOKEN = process.env.GITHUB_TOKEN;
const USER = process.env.USERNAME || "leofazanaro";
if (!TOKEN) throw new Error("GITHUB_TOKEN não definido");

const FONT = "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif";
const MUTED = "#848d97";
const ACCENT = "#2f81f7";

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function fetchData() {
  const repos = [];
  let after = null;
  let user;
  do {
    const d = await gql(
      `query($login: String!, $after: String) {
        user(login: $login) {
          followers { totalCount }
          contributionsCollection { totalCommitContributions totalPullRequestContributions }
          repositories(first: 100, after: $after, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
            totalCount
            pageInfo { hasNextPage endCursor }
            nodes {
              stargazerCount
              languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
                edges { size node { name color } }
              }
            }
          }
        }
      }`,
      { login: USER, after }
    );
    user = d.user;
    repos.push(...user.repositories.nodes);
    after = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (after);
  return { user, repos };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("pt-BR");

function frame(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">
<title>${esc(title)}</title>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="12" fill="none" stroke="${MUTED}" stroke-opacity=".35"/>
<text x="24" y="38" font-size="17" font-weight="700" fill="${ACCENT}">${esc(title)}</text>
${body}
</svg>
`;
}

function statsCard({ user, repos }) {
  const rows = [
    ["Repositórios públicos", user.repositories.totalCount],
    ["Estrelas recebidas", repos.reduce((s, r) => s + r.stargazerCount, 0)],
    ["Commits (últimos 12 meses)", user.contributionsCollection.totalCommitContributions],
    ["Pull requests (últimos 12 meses)", user.contributionsCollection.totalPullRequestContributions],
    ["Seguidores", user.followers.totalCount],
  ];
  const body = rows
    .map(([label, value], i) => {
      const y = 72 + i * 24;
      return `<text x="24" y="${y}" font-size="13.5" fill="${MUTED}">${esc(label)}</text>`
        + `<text x="326" y="${y}" font-size="13.5" font-weight="700" fill="${MUTED}" text-anchor="end">${fmt(value)}</text>`;
    })
    .join("\n");
  return frame(350, 72 + rows.length * 24 - 4, "Estatísticas do GitHub", body);
}

function languagesCard({ repos }, top = 6) {
  const totals = new Map();
  for (const r of repos) {
    for (const { size, node } of r.languages.edges) {
      const cur = totals.get(node.name) || { size: 0, color: node.color || MUTED };
      cur.size += size;
      totals.set(node.name, cur);
    }
  }
  const langs = [...totals.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, top);
  const sum = langs.reduce((s, [, v]) => s + v.size, 0) || 1;

  // Stacked bar
  const barW = 302;
  let x = 24;
  let bar = `<clipPath id="bar"><rect x="24" y="54" width="${barW}" height="8" rx="4"/></clipPath><g clip-path="url(#bar)">`;
  for (const [, v] of langs) {
    const w = (v.size / sum) * barW;
    bar += `<rect x="${x.toFixed(1)}" y="54" width="${(w + 0.5).toFixed(1)}" height="8" fill="${v.color}"/>`;
    x += w;
  }
  bar += "</g>";

  // Legend in two columns
  const legend = langs
    .map(([name, v], i) => {
      const cx = 24 + (i % 2) * 156;
      const cy = 88 + Math.floor(i / 2) * 22;
      const pct = ((v.size / sum) * 100).toFixed(1).replace(".", ",");
      return `<circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${v.color}"/>`
        + `<text x="${cx + 16}" y="${cy}" font-size="13" fill="${MUTED}">${esc(name)} <tspan font-weight="700">${pct}%</tspan></text>`;
    })
    .join("\n");
  const h = 88 + Math.ceil(langs.length / 2) * 22 - 4;
  return frame(350, Math.max(h, 132), "Linguagens mais usadas", bar + "\n" + legend);
}

const data = await fetchData();
mkdirSync("cards", { recursive: true });
writeFileSync("cards/stats.svg", statsCard(data));
writeFileSync("cards/languages.svg", languagesCard(data));
console.log(`OK: ${data.repos.length} repositórios lidos`);
