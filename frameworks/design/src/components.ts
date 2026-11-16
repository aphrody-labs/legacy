// The monorepo's only web component library: Angular Material (@angular/material), themed by
// tokens.css + angular-theme.scss. Angular standalone components, compiled by the app's Angular builder.
// Import 'APHRODY_MATERIAL' into the 'imports' array of a standalone component.
export { MatButtonModule } from "@angular/material/button";
export { MatButtonToggleModule } from "@angular/material/button-toggle";
export { MatCardModule } from "@angular/material/card";
export { MatCheckboxModule } from "@angular/material/checkbox";
export { MatChipsModule } from "@angular/material/chips";
export { MatDialogModule } from "@angular/material/dialog";
export { MatDividerModule } from "@angular/material/divider";
export { MatFormFieldModule } from "@angular/material/form-field";
export { MatIconModule } from "@angular/material/icon";
export { MatInputModule } from "@angular/material/input";
export { MatListModule } from "@angular/material/list";
export { MatMenuModule } from "@angular/material/menu";
export { MatProgressBarModule } from "@angular/material/progress-bar";
export { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
export { MatRadioModule } from "@angular/material/radio";
export { MatSelectModule } from "@angular/material/select";
export { MatSidenavModule } from "@angular/material/sidenav";
export { MatSlideToggleModule } from "@angular/material/slide-toggle";
export { MatSliderModule } from "@angular/material/slider";
export { MatTableModule } from "@angular/material/table";
export { MatTabsModule } from "@angular/material/tabs";
export { MatToolbarModule } from "@angular/material/toolbar";
export { MatTooltipModule } from "@angular/material/tooltip";
export { MatBadgeModule } from "@angular/material/badge";

import { MatBadgeModule } from "@angular/material/badge";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatCardModule } from "@angular/material/card";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatChipsModule } from "@angular/material/chips";
import { MatDialogModule } from "@angular/material/dialog";
import { MatDividerModule } from "@angular/material/divider";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatListModule } from "@angular/material/list";
import { MatMenuModule } from "@angular/material/menu";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatRadioModule } from "@angular/material/radio";
import { MatSelectModule } from "@angular/material/select";
import { MatSidenavModule } from "@angular/material/sidenav";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatSliderModule } from "@angular/material/slider";
import { MatTableModule } from "@angular/material/table";
import { MatTabsModule } from "@angular/material/tabs";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatTooltipModule } from "@angular/material/tooltip";

/** Every Angular Material module of the design system, for the 'imports' of a standalone component. */
export const APHRODY_MATERIAL = [
  MatBadgeModule,
  MatButtonModule,
  MatButtonToggleModule,
  MatCardModule,
  MatCheckboxModule,
  MatChipsModule,
  MatDialogModule,
  MatDividerModule,
  MatFormFieldModule,
  MatIconModule,
  MatInputModule,
  MatListModule,
  MatMenuModule,
  MatProgressBarModule,
  MatProgressSpinnerModule,
  MatRadioModule,
  MatSelectModule,
  MatSidenavModule,
  MatSlideToggleModule,
  MatSliderModule,
  MatTableModule,
  MatTabsModule,
  MatToolbarModule,
  MatTooltipModule,
] as const;
