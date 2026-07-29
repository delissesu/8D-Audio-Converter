export function showView(views, viewName) {
  Object.values(views).forEach((view) => view.classList.add("view-hidden"));
  views[viewName].classList.remove("view-hidden");
}
