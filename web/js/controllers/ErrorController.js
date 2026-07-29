import { showView } from "../utils/viewRouter.js";

export class ErrorController {
  constructor(refs) {
    this.refs = refs;
  }

  init(onBack, onRetry) {
    this.refs.btnErrBack.addEventListener("click", onBack);
    this.refs.btnErrRetry.addEventListener("click", onRetry);
  }

  show(message, code) {
    this.refs.errorMessage.textContent = message || "An unknown error occurred.";
    this.refs.errorCode.textContent = code || "ERR_UNKNOWN";
    showView(this.refs.views, "error");
  }
}
