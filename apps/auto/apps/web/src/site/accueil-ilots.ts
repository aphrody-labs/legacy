// Browser entry point of the showcase in production: the page is prerendered at build time (construction.tsx),
// only theme tracking and the islands (tabs, film) run; React is not downloaded.
import { activerIlots } from "./ilots";
import "./site";

activerIlots();
