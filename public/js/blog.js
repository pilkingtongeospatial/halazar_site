(() => {
  const links = [...document.querySelectorAll(".blog-cats a")];
  const cards = [...document.querySelectorAll(".post-card")];
  const empty = document.getElementById("no-posts");

  function apply() {
    const cat = location.hash.slice(1);
    let count = 0;
    for (const card of cards) {
      const match = !cat || card.dataset.category === cat;
      card.hidden = !match;
      if (match) count++;
    }
    empty.hidden = count > 0;
    for (const link of links) link.setAttribute("aria-current", link.getAttribute("href") === (cat ? `#${cat}` : "#"));
  }

  window.addEventListener("hashchange", apply);
  apply();
})();
