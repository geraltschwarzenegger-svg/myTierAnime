export function mountIcons() {
  const paths: Record<string, string> = {
    "↗": "M4 16 16 4M4 4h12v12",
    "↓": "M10 3v14m-5-5 5 5 5-5",
    "↺": "M4 8a7 7 0 1 1-1 6M4 3v5h5",
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode()))
    if (
      n.parentElement &&
      !["SCRIPT", "STYLE", "NOSCRIPT"].includes(n.parentElement.tagName) &&
      /[↗↓↺]/.test(n.textContent ?? "")
    )
      nodes.push(n as Text);
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    for (const text of (node.textContent ?? "").split(/([↗↓↺])/)) {
      if (paths[text]) {
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("viewBox", "0 0 20 20");
        svg.setAttribute("aria-hidden", "true");
        svg.classList.add("inline-icon");
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        path.setAttribute("d", paths[text]);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.append(path);
        fragment.append(svg);
      } else fragment.append(document.createTextNode(text));
    }
    node.replaceWith(fragment);
  }
}
