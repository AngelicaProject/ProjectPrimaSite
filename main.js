// Renders the page from content.json. Inside the texts, **bold**, `code`,
// and [link text](https://address) are supported; everything else is plain
// text.

function escape(text) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function format(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
      /^(https?:\/\/|#|\.{0,2}\/)/.test(href) ? `<a href="${href}">${label}</a>` : label);
}

function element(tag, attributes = {}, html = "") {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.innerHTML = html;
  return node;
}

function lookup(content, path) {
  return path.split(".").reduce((value, key) => (value == null ? value : value[key]), content);
}

function copyBlock(item, labels) {
  const block = element("div", { class: "copy" });
  block.append(
    element("span", { class: "label" }, format(item.label ?? "")),
    element("code", {}, escape(item.value)),
  );
  const button = element("button", { type: "button" }, escape(labels.idle));
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(item.value);
    } catch {
      // Older browsers or a denied permission: select the text instead.
      const range = document.createRange();
      range.selectNodeContents(block.querySelector("code"));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("copy");
    }
    button.textContent = labels.done;
    button.classList.add("done");
    setTimeout(() => {
      button.textContent = labels.idle;
      button.classList.remove("done");
    }, 2000);
  });
  block.append(button);
  return block;
}

// The newest release from the Harmonia feed: versions are dates (2026.10.01.0001).
function releaseDate(version) {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})\./.exec(version ?? "");
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function showStatus(content) {
  const status = document.getElementById("status");
  const texts = content.hero.status;
  if (!status || !texts) return;
  status.textContent = texts.loading;
  fetch(content.feed, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((feed) => {
      const releases = feed && Array.isArray(feed.releases) ? feed.releases : [];
      const release = releases.find((entry) => entry.channel === "stable") ?? releases[0];
      const date = release ? releaseDate(release.version) : null;
      if (!date) {
        status.textContent = texts.soon;
        return;
      }
      const template = release.channel === "stable" ? texts.latest : texts.testing;
      status.textContent = template.replace("{date}", date);
    })
    .catch(() => {
      status.hidden = true;
    });
}

// Fills the element with this id when the page has it. A browser may keep an
// older index.html from its cache next to a newer script, and a part missing
// from that page must not stop the rest of it.
function fill(id, build) {
  const node = document.getElementById(id);
  if (node) build(node);
}

function render(content) {
  if (content.banner) {
    let banner = document.getElementById("banner");
    if (!banner) {
      banner = element("div", { class: "banner", id: "banner", role: "note" });
      document.body.prepend(banner);
    }
    banner.innerHTML = `<p>${format(content.banner)}</p>`;
    banner.hidden = false;
  }

  for (const node of document.querySelectorAll("[data-text]")) {
    node.innerHTML = format(lookup(content, node.dataset.text) ?? "");
  }

  fill("nav", (nav) => {
    for (const link of content.nav ?? []) nav.append(element("a", { href: link.href }, escape(link.text)));
  });

  fill("buttons", (buttons) => {
    for (const button of content.hero?.buttons ?? []) {
      const style = button.style === "ghost" ? "button ghost" : "button";
      buttons.append(element("a", { class: style, href: button.href }, escape(button.text)));
    }
  });

  fill("steps", (steps) => {
    for (const step of content.install?.steps ?? []) {
      const item = element("li");
      item.append(element("h3", {}, format(step.title ?? "")), element("p", {}, format(step.text ?? "")));
      for (const copy of step.copy ?? []) item.append(copyBlock(copy, content.copyButton));
      steps.append(item);
    }
  });

  fill("questions", (questions) => {
    for (const entry of content.install?.questions ?? []) {
      const details = element("details");
      details.append(element("summary", {}, format(entry.question ?? "")), element("p", {}, format(entry.answer ?? "")));
      questions.append(details);
    }
  });

  fill("help-text", (help) => {
    for (const paragraph of content.help?.paragraphs ?? []) help.append(element("p", {}, format(paragraph)));
  });

  fill("footer", (footer) => {
    for (const paragraph of content.footer ?? []) footer.append(element("p", {}, format(paragraph)));
  });

  showStatus(content);
}

fetch("content.json", { cache: "no-cache" })
  .then((response) => {
    if (!response.ok) throw new Error(`content.json: ${response.status}`);
    return response.json();
  })
  .then(render)
  .catch((error) => {
    document.querySelector("main").prepend(
      element("p", { class: "noscript" }, `Не удалось загрузить тексты страницы (${escape(String(error.message))}).`),
    );
  });
