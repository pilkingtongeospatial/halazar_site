(() => {
  const main = document.getElementById("gallery-main");
  const thumbs = [...document.querySelectorAll(".gallery-thumbs button")];
  let index = 0;

  function show(i) {
    index = (i + thumbs.length) % thumbs.length;
    const img = thumbs[index].querySelector("img");
    main.src = img.src;
    main.alt = img.alt;
    thumbs.forEach((t, n) => t.setAttribute("aria-current", n === index));
    thumbs[index].scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  thumbs.forEach((t, n) => t.addEventListener("click", () => show(n)));
  document.querySelector(".gallery-prev").addEventListener("click", () => show(index - 1));
  document.querySelector(".gallery-next").addEventListener("click", () => show(index + 1));
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1);
    if (e.key === "ArrowRight") show(index + 1);
  });
})();
