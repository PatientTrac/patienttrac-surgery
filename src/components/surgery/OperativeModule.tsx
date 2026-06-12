// ================================================================
// PatientTrac Surgery — Intra-Operative / Operative Note Module
// Dark navy/gold theme matching Revela design system
// ================================================================

import React, { useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Save, Loader2, CheckCircle2, AlertTriangle, AlertCircle,
  Search, ChevronDown, Sparkles, Clock, Plus, Trash2,
  ClipboardList, Activity, FlaskConical, CheckSquare, Square,
  FileText, Stethoscope,
} from 'lucide-react';
import TimeOutChecklist from './TimeOutChecklist';
import MARPanel from './MARPanel';
import ImplantPanel from './ImplantPanel';
import AnesthesiaRecord from './AnesthesiaRecord';

// ── Props ────────────────────────────────────────────────────────
interface Props {
  patientId: string | number;
  encounterId: string | number;
  orgId: string;
  onSave?: (noteId: string) => void;
}

// ── Procedure templates ──────────────────────────────────────────
interface ProcedureTemplate {
  id: string;
  label: string;
  category: string;
  approach: string;
  preOpDx: string;
  procedurePerformed: string;
  descriptionTemplate: string;
  defaultSpecimens: string;
  defaultImplants: string;
  closingMethod: string;
}

const PROCEDURE_TEMPLATES: ProcedureTemplate[] = [
  {
    id: 'lap_chole',
    label: 'Laparoscopic Cholecystectomy',
    category: 'Biliary',
    approach: 'Laparoscopic, 4-port',
    preOpDx: 'Cholelithiasis / acute cholecystitis',
    procedurePerformed: 'Laparoscopic cholecystectomy',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position. General endotracheal anesthesia was administered. The abdomen was prepped and draped in the usual sterile fashion.

A periumbilical incision was made and pneumoperitoneum was established with a Veress needle to [XX] mmHg. A 12-mm trocar was placed at the umbilicus under direct vision. Three additional 5-mm trocars were placed in the epigastric, right midclavicular, and right anterior axillary positions. The camera was introduced and the abdominal cavity was inspected. [FINDINGS]

The fundus of the gallbladder was grasped and retracted cephalad. The infundibulum was retracted laterally. The peritoneum overlying the hepatocystic triangle was incised. Dissection was carried out to achieve the critical view of safety, clearly demonstrating two and only two structures entering the gallbladder. The cystic duct and cystic artery were individually clipped with [CLIP TYPE] clips and divided. The gallbladder was dissected from the liver bed in a retrograde fashion using electrocautery. Hemostasis was achieved. The gallbladder was removed through the umbilical port site in a retrieval bag. The specimen was inspected and opened on the back table. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. The fascia at the umbilical port was closed with [SUTURE]. Skin incisions were closed with [SUTURE] and steri-strips. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'Gallbladder with bile and stones — sent to pathology',
    defaultImplants: 'Hem-o-lok clips (cystic duct and artery)',
    closingMethod: '0-Vicryl fascial closure at umbilical port; 4-0 Monocryl subcuticular skin closure',
  },
  {
    id: 'open_chole',
    label: 'Open Cholecystectomy',
    category: 'Biliary',
    approach: 'Open, right subcostal (Kocher) incision',
    preOpDx: 'Cholelithiasis / cholecystitis — laparoscopic approach not feasible',
    procedurePerformed: 'Open cholecystectomy',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position. General endotracheal anesthesia was administered. The abdomen was prepped and draped in sterile fashion.

A right subcostal (Kocher) incision was made and carried through the subcutaneous tissue and fascia. The peritoneum was entered. The abdomen was explored. [FINDINGS] Retractors were placed. The hepatocystic triangle was carefully dissected. The cystic duct and cystic artery were identified, doubly ligated with [SUTURE/CLIP], and divided. The gallbladder was removed from the liver bed using electrocautery. Hemostasis was achieved with electrocautery and [HEMOSTATIC AGENT if used]. The wound was irrigated with warm saline. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. The fascia was closed with running [SUTURE]. Subcutaneous tissue was irrigated. Skin was closed with [SUTURE]. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'Gallbladder — sent to pathology',
    defaultImplants: 'None',
    closingMethod: 'Running loop PDS fascial closure; stapled skin',
  },
  {
    id: 'lap_appy',
    label: 'Laparoscopic Appendectomy',
    category: 'Appendix',
    approach: 'Laparoscopic, 3-port',
    preOpDx: 'Acute appendicitis',
    procedurePerformed: 'Laparoscopic appendectomy',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position. General endotracheal anesthesia was administered. The abdomen was prepped and draped in sterile fashion.

A periumbilical incision was made and pneumoperitoneum was established to [XX] mmHg. A 12-mm trocar was placed at the umbilicus. A 5-mm trocar was placed in the suprapubic region and a 5-mm trocar in the left lower quadrant. The camera was introduced. The abdomen was inspected. [FINDINGS: appendix, peritoneal cavity, pelvis] The appendix was identified and grasped at the tip. The mesoappendix was divided using [ENERGY DEVICE/CLIPS]. The base of the appendix was ligated with two [ENDOLOOP/STAPLER] ligatures and divided. The stump was [inspected/cauterized]. The appendix was removed in a specimen retrieval bag. The abdomen was irrigated with [VOLUME] mL of warm saline. The field was inspected and found to be hemostatic. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. Trocars were removed under direct vision. The umbilical fascia was closed with [SUTURE]. Skin closed with [SUTURE]. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'Appendix — sent to pathology',
    defaultImplants: 'Endoloops x2 at appendiceal base',
    closingMethod: '0-Vicryl fascial closure at umbilical port; 4-0 Monocryl subcuticular',
  },
  {
    id: 'open_appy',
    label: 'Open Appendectomy',
    category: 'Appendix',
    approach: 'Open, McBurney / Rocky-Davis incision',
    preOpDx: 'Acute appendicitis',
    procedurePerformed: 'Open appendectomy',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position. General endotracheal anesthesia was administered. The right lower quadrant was prepped and draped in sterile fashion.

A [McBurney/Rocky-Davis] incision was made over the right lower quadrant. The external oblique aponeurosis was incised and the internal oblique and transverse abdominis were split. The peritoneum was incised. The cecum was delivered into the wound. [FINDINGS] The appendix was identified. The mesoappendix was serially clamped, divided, and ligated. The base of the appendix was clamped, ligated with [SUTURE], and divided. The stump was [inverted/cauterized]. The wound was irrigated with warm saline. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. The peritoneum and muscle layers were closed with [SUTURE]. Fascia was closed with [SUTURE]. Skin was closed with [SUTURE]. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'Appendix — sent to pathology',
    defaultImplants: 'None',
    closingMethod: 'Layered closure — peritoneum 2-0 Vicryl; fascia 0-Vicryl; skin 3-0 Monocryl',
  },
  {
    id: 'lap_ihr',
    label: 'Inguinal Hernia Repair (Lap)',
    category: 'Hernia',
    approach: 'Laparoscopic — TAPP (transabdominal preperitoneal)',
    preOpDx: 'Inguinal hernia — [right/left/bilateral]',
    procedurePerformed: 'Laparoscopic inguinal hernia repair (TAPP)',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position. General endotracheal anesthesia was administered. The abdomen was prepped and draped in sterile fashion.

Pneumoperitoneum was established at the umbilicus to [XX] mmHg. Two 5-mm working ports were placed under direct vision. The hernia defect was confirmed laparoscopically as [direct/indirect/both]. The hernia sac was reduced. The preperitoneal space was developed widely using blunt and sharp dissection, exposing Cooper's ligament, the iliopubic tract, and the epigastric vessels. A [XX x XX cm] [MESH BRAND] flat mesh was fashioned and positioned to cover the myopectineal orifice with adequate overlap. The mesh was fixed with [TACKER/SUTURES/NO FIXATION]. The peritoneum was closed over the mesh with [STAPLES/SUTURES] in running fashion. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. Trocars removed under vision. Umbilical fascia closed. Skin closed with [SUTURE]. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'None',
    defaultImplants: '[MESH BRAND] polypropylene mesh [XX x XX cm]; [fixation device]',
    closingMethod: '0-Vicryl fascial closure at umbilical port; 4-0 Monocryl subcuticular',
  },
  {
    id: 'open_ihr_lichtenstein',
    label: 'Inguinal Hernia Repair (Open — Lichtenstein)',
    category: 'Hernia',
    approach: 'Open, inguinal incision — Lichtenstein tension-free repair',
    preOpDx: 'Inguinal hernia — [right/left]',
    procedurePerformed: 'Open Lichtenstein tension-free inguinal hernia repair',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position. The procedure was performed under [general/spinal/local with MAC] anesthesia. The groin was prepped and draped in sterile fashion.

An oblique inguinal incision was made. The external oblique aponeurosis was opened and the inguinal canal exposed. The ilioinguinal nerve was identified and preserved. The spermatic cord [or round ligament] was mobilized. The hernia type was confirmed as [direct/indirect]. The sac was dissected, reduced, and [ligated/inverted]. A [XX x XX cm] [MESH BRAND] flat polypropylene mesh was fashioned and sutured medially to the pubic tubercle with [SUTURE], laterally to the shelving edge of the inguinal ligament with a running [SUTURE], and medially/superiorly to the conjoint tendon with interrupted [SUTURE]. The tail of the mesh was split and wrapped around the cord to create a new internal ring. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. The external oblique was closed with [SUTURE]. Scarpa's fascia and skin were closed in layers. The patient tolerated the procedure well and was taken to PACU in stable condition.`,
    defaultSpecimens: 'None',
    defaultImplants: '[MESH BRAND] polypropylene flat mesh [XX x XX cm]',
    closingMethod: 'External oblique 2-0 Vicryl; Scarpa 3-0 Vicryl; skin 4-0 Monocryl',
  },
  {
    id: 'ventral_hernia',
    label: 'Ventral/Incisional Hernia Repair',
    category: 'Hernia',
    approach: 'Open or laparoscopic — per operative findings',
    preOpDx: 'Ventral/incisional hernia',
    procedurePerformed: 'Ventral/incisional hernia repair with mesh',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position. General endotracheal anesthesia was administered. The abdomen was prepped and draped in sterile fashion.

[OPEN APPROACH: An elliptical incision was made incorporating the old scar. The hernia sac was dissected from surrounding tissue. Adhesions were taken down sharply and bluntly. The hernia sac was opened and the contents reduced. The fascial defect measured approximately [XX x XX] cm. The fascial edges were freshened. / LAPAROSCOPIC APPROACH: Pneumoperitoneum was established. Trocars were placed away from the defect. Adhesions were taken down. The defect was measured intracorporeally.]

A [XX x XX cm] [MESH BRAND/TYPE] mesh was selected to allow ≥ 3 cm overlap on all sides. [FIXATION TECHNIQUE]. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. [Closure details]. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'None',
    defaultImplants: '[MESH BRAND/TYPE] — [XX x XX cm] — [fixation: tacks, sutures, or glue]',
    closingMethod: 'Primary fascial closure if achievable; skin per approach',
  },
  {
    id: 'umbilical_hernia',
    label: 'Umbilical Hernia Repair',
    category: 'Hernia',
    approach: 'Open, periumbilical incision',
    preOpDx: 'Umbilical hernia',
    procedurePerformed: 'Umbilical hernia repair',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position. The procedure was performed under [general/local with MAC] anesthesia. The abdomen was prepped and draped in sterile fashion.

A curvilinear periumbilical incision was made. The hernia sac was dissected free from the overlying skin. The sac was opened; contents were [omentum only / bowel — reduced]. The fascial defect measured approximately [XX] cm. The sac was excised/reduced. [PRIMARY CLOSURE: The fascia was closed primarily with interrupted [SUTURE] / MESH: A [XX x XX cm] [MESH BRAND] mesh was placed in [onlay/sublay/underlay] position and secured with [SUTURE/TACKER].] Sponge, instrument, and needle counts were correct x[COUNT] per circulator. Subcutaneous tissue closed with [SUTURE]. Skin closed with [SUTURE]. The patient tolerated the procedure well and was taken to PACU in stable condition.`,
    defaultSpecimens: 'None',
    defaultImplants: '[Mesh if used — brand and size]',
    closingMethod: '0-PDS fascial repair; 4-0 Monocryl skin',
  },
  {
    id: 'right_hemi',
    label: 'Right Hemicolectomy',
    category: 'Colon',
    approach: 'Open or laparoscopic-assisted',
    preOpDx: 'Right colon mass / Crohn\'s disease / volvulus',
    procedurePerformed: 'Right hemicolectomy with ileocolic anastomosis',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position. General endotracheal anesthesia was administered. A Foley catheter was inserted. The abdomen was prepped and draped in sterile fashion.

[OPEN: A midline laparotomy was performed. / LAPAROSCOPIC: Pneumoperitoneum was established. Trocars placed.] The abdominal cavity was explored. [FINDINGS] The right colon was mobilized by incising the white line of Toldt from the cecum to the hepatic flexure. The ileocolic pedicle was identified, ligated, and divided at its origin. The right branch of the middle colic vessels was similarly controlled. The terminal ileum was divided [XX] cm proximal to the ileocecal valve. The transverse colon was divided distal to the hepatic flexure. The specimen was removed. A [hand-sewn / stapled — side-to-side or end-to-end] ileocolic anastomosis was created and tested for hemostasis, tension, and integrity. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. The abdomen was irrigated and closed. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'Right colon + terminal ileum — sent to pathology; margins labeled',
    defaultImplants: '[Stapler cartridges used — document brand and size]',
    closingMethod: 'Running loop PDS mass closure; skin staples',
  },
  {
    id: 'left_hemi_sigmoid',
    label: 'Left Hemicolectomy / Sigmoid Resection',
    category: 'Colon',
    approach: 'Open or laparoscopic-assisted',
    preOpDx: 'Left colon / sigmoid mass or diverticular disease',
    procedurePerformed: 'Left hemicolectomy / sigmoid resection with colorectal anastomosis',
    descriptionTemplate: `The patient was brought to the operating room and placed in the modified lithotomy position. General endotracheal anesthesia was administered. A Foley catheter was inserted. The abdomen was prepped and draped in sterile fashion.

[OPEN: Midline laparotomy. / LAPAROSCOPIC: Pneumoperitoneum established. Trocars placed.] Abdominal cavity explored. [FINDINGS] The left colon was mobilized by incising the white line of Toldt. The splenic flexure was taken down. The left ureter was identified and preserved. The inferior mesenteric artery was divided [at its origin / distal to the left colic]. The sigmoid colon and the specimen were fully mobilized. The proximal colon was divided with a linear stapler. The distal margin was divided at the rectosigmoid junction / proximal rectum. The specimen was removed. A circular end-to-end stapled colorectal anastomosis was created. The anastomosis was tested with air insufflation — [no leak / leak — repaired]. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. [Drain placed at surgeon discretion.] Abdomen irrigated and closed. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'Left colon / sigmoid — sent to pathology; proximal and distal margins labeled',
    defaultImplants: 'Circular stapler [size] + linear stapler cartridges [brand/size]',
    closingMethod: 'Running loop PDS mass closure; skin staples',
  },
  {
    id: 'lar',
    label: 'Low Anterior Resection',
    category: 'Colon/Rectum',
    approach: 'Open or laparoscopic/robotic-assisted — total mesorectal excision (TME)',
    preOpDx: 'Rectal adenocarcinoma / rectal mass',
    procedurePerformed: 'Low anterior resection with total mesorectal excision and colorectal/coloanal anastomosis',
    descriptionTemplate: `The patient was brought to the operating room and placed in the modified lithotomy position. General endotracheal anesthesia was administered. A Foley catheter was inserted. The abdomen and perineum were prepped and draped. [Ureteral stents placed if applicable.]

[APPROACH DESCRIPTION.] The abdominal cavity was explored. [FINDINGS] The sigmoid and left colon were fully mobilized. The inferior mesenteric artery was divided [at origin / distal to left colic]. Total mesorectal excision was performed under sharp dissection, following the avascular presacral plane. The lateral ligaments and rectourethralis were divided. The mesorectum was divided [XX] cm distal to the distal tumor margin. The rectum was divided with a [STAPLER SIZE] linear stapler at [LEVEL]. The proximal colon was transected. A [28/29/31]-mm circular EEA anastomosis was created. Air leak test — [negative / positive — repaired]. Diverting loop ileostomy was [created / not created] at [site]. Sponge, instrument, and needle counts were correct x[COUNT]. Drain placed [if applicable]. Wound closed. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'Rectosigmoid specimen — sent to pathology; proximal, distal, and radial margins labeled',
    defaultImplants: 'Circular EEA stapler [size]; linear stapler cartridges; [ureteral stents if placed]',
    closingMethod: 'Running loop PDS mass closure; skin staples',
  },
  {
    id: 'hartmann',
    label: 'Hartmann Procedure',
    category: 'Colon/Rectum',
    approach: 'Open midline laparotomy',
    preOpDx: 'Perforated diverticulitis / obstructing left colon cancer / fecal peritonitis',
    procedurePerformed: 'Hartmann procedure — sigmoid resection, end colostomy, oversewn rectal stump',
    descriptionTemplate: `The patient was brought to the operating room as an [emergent/urgent] case and placed in the supine position. General endotracheal anesthesia was administered. A Foley catheter was inserted. The abdomen was prepped and draped in sterile fashion.

A midline laparotomy was performed. Upon entering the abdomen, [FINDINGS — e.g., fecal soilage, purulent peritonitis, extent of contamination]. The abdomen was thoroughly irrigated with [VOLUME] mL warm saline. The sigmoid colon was mobilized. The mesentery was divided and the inferior mesenteric vessels ligated. The sigmoid was resected; the proximal colon was transected with a linear stapler. The rectal stump was [oversewn / stapled and left in situ]. An end sigmoid colostomy was brought through the left lower quadrant. The abdomen was re-irrigated. [Drain(s) placed.] Sponge, instrument, and needle counts were correct x[COUNT] per circulator. Fascia closed. Skin closed / [left open due to contamination]. The colostomy was matured. The patient was taken to the PACU in stable condition.`,
    defaultSpecimens: 'Sigmoid colon — sent to pathology',
    defaultImplants: 'Linear stapler cartridges',
    closingMethod: 'Running loop PDS fascial closure; skin staples or wet-to-dry if contaminated',
  },
  {
    id: 'thyroidectomy',
    label: 'Thyroidectomy (Total / Hemi)',
    category: 'Endocrine',
    approach: 'Open, low cervical collar incision',
    preOpDx: 'Thyroid nodule / differentiated thyroid cancer / hyperthyroidism',
    procedurePerformed: 'Total thyroidectomy / hemithyroidectomy',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position with a shoulder roll. General endotracheal anesthesia was administered [with neuromonitoring endotracheal tube for RLN monitoring]. The neck was prepped and draped in sterile fashion.

A low collar incision was made and carried through the platysma. Subplatysmal flaps were raised. The strap muscles were divided in the midline and retracted laterally. The thyroid lobe was gently retracted medially. The superior pole vessels were carefully ligated close to the gland to preserve the external branch of the superior laryngeal nerve. The recurrent laryngeal nerve was identified in the tracheoesophageal groove and traced to the ligament of Berry. [If NIM used: signal confirmed throughout.] The inferior thyroid artery branches were individually ligated. The parathyroid glands were identified and carefully preserved [with vascular pedicles intact / reimplanted in the sternocleidomastoid muscle]. The thyroid lobe was dissected off the trachea and removed. [CONTRALATERAL SIDE if total thyroidectomy.] Final NIM signal check — [intact bilaterally / results]. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. Meticulous hemostasis achieved. Drain placed (or not). Strap muscles reapproximated. Platysma closed with [SUTURE]. Skin closed with [SUTURE]. Dermabond applied. The patient tolerated the procedure well and was taken to PACU in stable condition.`,
    defaultSpecimens: 'Thyroid lobe(s) — sent to pathology; any enlarged lymph nodes labeled',
    defaultImplants: 'Harmonic scalpel used; [neuromonitoring tube]; [drain]',
    closingMethod: '3-0 Vicryl strap muscles; 3-0 Vicryl platysma; 4-0 Monocryl subcuticular + Dermabond',
  },
  {
    id: 'parathyroidectomy',
    label: 'Parathyroidectomy',
    category: 'Endocrine',
    approach: 'Open, focused or bilateral cervical exploration',
    preOpDx: 'Primary hyperparathyroidism / parathyroid adenoma',
    procedurePerformed: 'Parathyroidectomy — focused / bilateral exploration',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position with a shoulder roll. General endotracheal anesthesia [or local/MAC for focused approach] was administered. The neck was prepped and draped in sterile fashion.

Preoperative PTH: [VALUE] pg/mL. A low collar incision was made and carried through the platysma. [FOCUSED: Only the ipsilateral side was explored. / BILATERAL: Both sides were explored.] The parathyroid gland(s) were identified. The adenoma measured approximately [XX x XX x XX] mm and was located at the [right/left — superior/inferior] position. The feeding vessel was divided and the adenoma was excised. The remaining parathyroid glands were identified and appear normal. Intraoperative PTH at 10 minutes post-excision: [VALUE] pg/mL — [>50% decrease from baseline — criteria met / criteria not met — further exploration]. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. Hemostasis achieved. Drain not placed. Strap muscles reapproximated. Platysma and skin closed. The patient tolerated the procedure well.`,
    defaultSpecimens: 'Parathyroid adenoma — sent to pathology; intraoperative PTH levels documented',
    defaultImplants: 'None',
    closingMethod: '3-0 Vicryl platysma; 4-0 Monocryl subcuticular + Dermabond',
  },
  {
    id: 'lumpectomy_slnb',
    label: 'Breast Lumpectomy with Sentinel Node',
    category: 'Breast',
    approach: 'Open — lumpectomy incision + axillary sentinel node incision',
    preOpDx: 'Breast carcinoma — [right/left], [location]',
    procedurePerformed: 'Breast lumpectomy with sentinel lymph node biopsy',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position with the ipsilateral arm extended on an arm board. General endotracheal anesthesia [or MAC] was administered. The chest and axilla were prepped and draped in sterile fashion.

[LOCALIZATION: A [wire / seed / SAVI Scout / radioactive seed] had been placed preoperatively for localization of the target lesion.]

LUMPECTOMY: An incision was made over the [location] breast. The lesion was excised with a margin of normal breast tissue. Specimen orientation sutures were placed: [short = superior, long = lateral / or per surgeon convention]. The specimen was sent for intraoperative [pathology / specimen radiograph / margin assessment]. Margins were [clear / re-excision of [DIRECTION] margin performed].

SENTINEL NODE BIOPSY: Technetium-99m sulfur colloid [and/or isosulfan blue dye] had been injected preoperatively. The axillary incision was made. Using the gamma probe, [NUMBER] hot and/or blue sentinel nodes were identified and excised. Radioactive counts: [EX-VIVO vs. BACKGROUND]. Nodes sent to pathology. Axillary wound irrigated and closed. Lumpectomy cavity was [marked with clips for radiation targeting]. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. The patient tolerated the procedure well and was taken to PACU.`,
    defaultSpecimens: 'Breast lumpectomy specimen (oriented) + [N] sentinel lymph nodes — sent to pathology',
    defaultImplants: 'Surgical clips for lumpectomy cavity marking; [localization device removed]',
    closingMethod: '3-0 Vicryl deep breast tissue; 4-0 Monocryl subcuticular; Dermabond',
  },
  {
    id: 'mastectomy',
    label: 'Mastectomy (Simple / Modified Radical)',
    category: 'Breast',
    approach: 'Open — transverse elliptical mastectomy incision',
    preOpDx: 'Breast carcinoma / DCIS — [right/left]',
    procedurePerformed: 'Simple mastectomy / modified radical mastectomy',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position with the ipsilateral arm extended. General endotracheal anesthesia was administered. The chest, axilla, and arm were prepped and draped in sterile fashion.

A transverse elliptical incision was marked and incised, including the nipple-areola complex [unless nipple-sparing procedure]. Skin flaps were developed superiorly, inferiorly, medially, and laterally. The breast tissue was dissected off the pectoralis fascia. [SIMPLE MASTECTOMY: Axillary tail cleared to level I nodes.] [MODIFIED RADICAL: Level I and II axillary lymph node dissection was performed. The axillary vein was identified and protected. Fatty and nodal tissue from levels I and II was removed. The long thoracic nerve and thoracodorsal neurovascular bundle were identified and preserved.] The specimen was removed and labeled. [Reconstruction: [Expander / implant / flap] — Plastics team present.] Two closed suction drains were placed [if MRM]. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. Wound closed in layers. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'Mastectomy specimen + axillary contents (labeled) — sent to pathology',
    defaultImplants: '[Tissue expander / implant — brand, style, size if reconstruction]; closed suction drains x2',
    closingMethod: '2-0 Vicryl deep dermis; 3-0 Monocryl subcuticular; Dermabond',
  },
  {
    id: 'skin_excision',
    label: 'Skin/Soft Tissue Excision',
    category: 'Soft Tissue',
    approach: 'Excision with primary closure or flap/graft',
    preOpDx: 'Skin/soft tissue lesion — [benign/malignant/suspicious]',
    procedurePerformed: 'Excision of skin/soft tissue lesion',
    descriptionTemplate: `The patient was brought to the operating room and placed in the [POSITION] position. The procedure was performed under [general/local with MAC] anesthesia. The [SITE] was prepped and draped in sterile fashion.

The lesion at the [ANATOMIC LOCATION] was identified and measured at [XX x XX] cm. An elliptical incision was planned to include a [XX]-cm margin of normal tissue in all directions. The incision was made with a #15 blade and deepened to [dermis / subcutaneous fat / fascia / muscle]. The specimen was excised in its entirety. Hemostasis was achieved with electrocautery. The wound defect measured [XX x XX] cm. [PRIMARY CLOSURE: The wound was closed primarily with deep interrupted [SUTURE] and skin [SUTURE]. / FLAP or GRAFT: [DESCRIPTION of reconstruction].] Sponge, instrument, and needle counts were correct x[COUNT] per circulator. The patient tolerated the procedure well and was taken to the PACU in stable condition.`,
    defaultSpecimens: 'Skin/soft tissue excision specimen (oriented — long = [DIRECTION]) — sent to pathology',
    defaultImplants: 'None',
    closingMethod: 'Deep interrupted 3-0 Vicryl; skin 4-0 Monocryl subcuticular; Dermabond',
  },
  {
    id: 'abscess_id',
    label: 'Abscess Incision & Drainage',
    category: 'Soft Tissue',
    approach: 'Incision over fluctuant area',
    preOpDx: 'Soft tissue abscess — [LOCATION]',
    procedurePerformed: 'Incision and drainage of abscess',
    descriptionTemplate: `The patient was brought to the [operating room / procedure room / bedside] and placed in [POSITION]. The procedure was performed under [general/local] anesthesia. The [LOCATION] was prepped and draped in sterile fashion.

The area of maximum fluctuance was identified. An incision was made over the abscess and purulent material was expressed. A culture swab was obtained and sent to microbiology. The abscess cavity was thoroughly broken up with a hemostat and irrigated with [VOLUME] mL of saline. The cavity was packed with [MATERIAL: plain gauze / iodoform gauze]. The wound was left open. The patient tolerated the procedure well. Wound care instructions provided. Follow-up in [TIMEFRAME] for wound check.`,
    defaultSpecimens: 'Wound culture sent to microbiology',
    defaultImplants: 'None',
    closingMethod: 'Wound packed open — iodoform/plain gauze; wound care instructions given',
  },
  {
    id: 'ex_lap',
    label: 'Exploratory Laparotomy',
    category: 'General',
    approach: 'Open midline laparotomy',
    preOpDx: 'Acute abdomen / abdominal pain — etiology undetermined',
    procedurePerformed: 'Exploratory laparotomy',
    descriptionTemplate: `The patient was brought to the operating room and placed in the supine position. General endotracheal anesthesia was administered. A Foley catheter was inserted. The abdomen was prepped and draped in sterile fashion.

A midline laparotomy incision was made from the xiphoid to the pubis. Upon entering the abdomen, [FINDINGS — describe peritoneal fluid, odor, quantity; gross contamination; extent of disease]. A systematic exploration of the abdominal cavity was performed: [liver, gallbladder, stomach, small bowel from Treitz to ileocecal valve, colon, appendix, pelvis, retroperitoneum]. Findings as above. [PROCEDURE PERFORMED BASED ON FINDINGS — describe each step].

[DAMAGE CONTROL if applicable: Hemorrhage controlled with [packing/sutures/clamps]. Bowel ends stapled without anastomosis. Temporary abdominal closure performed. Plan for return to OR in [TIMEFRAME].] The abdomen was thoroughly irrigated with [VOLUME] mL warm saline. Sponge, instrument, and needle counts were correct x[COUNT] per circulator. The fascia was closed with [SUTURE / left open for damage control]. The patient tolerated the procedure and was taken to [PACU / ICU] in [stable / critical] condition.`,
    defaultSpecimens: '[Specify any specimens taken]',
    defaultImplants: '[Specify any devices or implants]',
    closingMethod: 'Running loop PDS mass closure; skin closed / left open per wound status',
  },
];

// ── Anesthesia types ─────────────────────────────────────────────
const ANESTHESIA_TYPES = ['GA — General Endotracheal', 'GA — LMA', 'Regional — Spinal', 'Regional — Epidural', 'Regional — Nerve Block', 'Local with MAC', 'Local Only'] as const;
type AnesthesiaType = typeof ANESTHESIA_TYPES[number];

// ── Timeline entry ───────────────────────────────────────────────
type TimelineEventType = 'incision' | 'closure' | 'complication' | 'specimen' | 'note' | 'milestone';

interface TimelineEntry {
  id: string;
  timestamp: string;
  eventType: TimelineEventType;
  text: string;
}

// ── Main form state ──────────────────────────────────────────────
interface OperativeNoteState {
  selectedProcedureId: string;
  preOpDx: string;
  postOpDx: string;
  procedurePerformed: string;
  surgeon: string;
  assistant: string;
  anesthesiaType: AnesthesiaType | '';
  anesthesiologist: string;
  eblMl: string;
  fluidsIn: string;
  fluidsOut: string;
  urineMl: string;
  complications: string;
  complicationsFreeText: string;
  implants: string;
  specimens: string;
  drains: string;
  countsCorrect: boolean;
  patientTolerance: string;
  description: string;
  closingMethod: string;
  intraOpFindings: string;
}

const EMPTY_STATE: OperativeNoteState = {
  selectedProcedureId: '',
  preOpDx: '',
  postOpDx: '',
  procedurePerformed: '',
  surgeon: '',
  assistant: '',
  anesthesiaType: '',
  anesthesiologist: '',
  eblMl: '',
  fluidsIn: '',
  fluidsOut: '',
  urineMl: '',
  complications: 'None',
  complicationsFreeText: '',
  implants: '',
  specimens: '',
  drains: '',
  countsCorrect: false,
  patientTolerance: 'The patient tolerated the procedure well.',
  description: '',
  closingMethod: '',
  intraOpFindings: '',
};

// ── AI Draft response ────────────────────────────────────────────
interface AIDraftResponse {
  operativeNoteDraft?: {
    procedureDetails?: string;
    preoperativeDiagnosis?: string;
    postoperativeDiagnosis?: string;
    approach?: string;
    complications?: string;
    specimens?: string | null;
    implants?: string | null;
    ebl?: string;
    fluidAdministered?: string;
    counts?: string;
    disposition?: string;
  };
  dictationPrompts?: string[];
  qualityFlags?: string[];
  completenessScore?: number;
}

// ── Theme tokens ─────────────────────────────────────────────────
const T = {
  navy: '#0B1527',
  navyMid: '#132040',
  navyLight: '#1A2C57',
  navyBorder: '#243660',
  gold: '#C9A84C',
  goldLight: '#E2C07A',
  goldDim: '#8B6E32',
  text: '#E8EDF5',
  textMuted: '#8A9BC0',
  textDim: '#6A7EA8',
  success: '#34C759',
  successBg: '#0D2A18',
  error: '#FF3B30',
  errorBg: '#2A0D0D',
  warning: '#FF9F0A',
  warningBg: '#2A1A00',
  inputBg: '#0D1B35',
  sectionBg: '#0F1E3A',
};

// ── Styles helpers ───────────────────────────────────────────────
const card: React.CSSProperties = {
  background: T.navyMid,
  border: `1px solid ${T.navyBorder}`,
  borderRadius: 10,
  padding: '20px 22px',
  marginBottom: 16,
};

const sectionHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 16,
  paddingBottom: 10,
  borderBottom: `1px solid ${T.navyBorder}`,
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: T.textMuted,
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: T.inputBg,
  border: `1px solid ${T.navyBorder}`,
  borderRadius: 6,
  padding: '9px 12px',
  color: T.text,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  lineHeight: 1.6,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer',
  paddingRight: 32,
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gap: 14,
};

const fieldGroup = (cols: string): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: cols,
  gap: 14,
});

// ── Event type colors ─────────────────────────────────────────────
const EVENT_COLORS: Record<TimelineEventType, string> = {
  incision: '#C9A84C',
  closure: '#34C759',
  complication: '#FF3B30',
  specimen: '#AF52DE',
  milestone: '#5AC8FA',
  note: '#8A9BC0',
};

const EVENT_LABELS: Record<TimelineEventType, string> = {
  incision: 'Incision',
  closure: 'Closure',
  complication: 'Complication',
  specimen: 'Specimen',
  milestone: 'Milestone',
  note: 'Note',
};

// ── Small UI components ──────────────────────────────────────────
function SectionTitle({ icon: Icon, title, color = T.gold }: { icon: React.ElementType; title: string; color?: string }) {
  return (
    <div style={sectionHeader}>
      <Icon size={16} color={color} />
      <span style={{ fontSize: 13, fontWeight: 700, color: T.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </span>
    </div>
  );
}

function CheckboxField({ checked, onChange, label: lbl }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <span onClick={() => onChange(!checked)} style={{ display: 'flex', alignItems: 'center' }}>
        {checked
          ? <CheckSquare size={18} color={T.gold} />
          : <Square size={18} color={T.textMuted} />}
      </span>
      <span style={{ fontSize: 14, color: T.text }}>{lbl}</span>
    </label>
  );
}

// ── Timestamp helper ─────────────────────────────────────────────
function nowTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── Main component ────────────────────────────────────────────────
const OperativeModule: React.FC<Props> = ({ patientId, encounterId, orgId, onSave }) => {
  const [note, setNote] = useState<OperativeNoteState>(EMPTY_STATE);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProcedureDropdown, setShowProcedureDropdown] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [aiFlags, setAiFlags] = useState<string[]>([]);
  const [aiPrompts, setAiPrompts] = useState<string[]>([]);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [newEntry, setNewEntry] = useState<{ type: TimelineEventType; text: string }>({ type: 'note', text: '' });
  const [saveError, setSaveError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Procedure filtering ────────────────────────────────────────
  const filteredProcedures = PROCEDURE_TEMPLATES.filter(p =>
    p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const grouped = filteredProcedures.reduce<Record<string, ProcedureTemplate[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  // ── Select procedure ───────────────────────────────────────────
  const selectProcedure = useCallback((proc: ProcedureTemplate) => {
    setNote(prev => ({
      ...prev,
      selectedProcedureId: proc.id,
      preOpDx: proc.preOpDx,
      postOpDx: prev.postOpDx || proc.preOpDx,
      procedurePerformed: proc.procedurePerformed,
      description: proc.descriptionTemplate,
      implants: proc.defaultImplants,
      specimens: proc.defaultSpecimens,
      closingMethod: proc.closingMethod,
    }));
    setShowProcedureDropdown(false);
    setSearchQuery('');
  }, []);

  const selectedProc = PROCEDURE_TEMPLATES.find(p => p.id === note.selectedProcedureId);

  // ── Field updater ──────────────────────────────────────────────
  const set = useCallback(<K extends keyof OperativeNoteState>(k: K, v: OperativeNoteState[K]) => {
    setNote(prev => ({ ...prev, [k]: v }));
  }, []);

  // ── AI Draft ──────────────────────────────────────────────────
  const handleAIDraft = useCallback(async () => {
    if (!selectedProc) return;
    setAiStatus('loading');
    setAiFlags([]);
    setAiPrompts([]);
    setAiScore(null);

    try {
      const payload = {
        procedure: selectedProc.label,
        approach: selectedProc.approach,
        findings: note.intraOpFindings || 'No additional findings specified',
        complications: note.complications === 'None' ? 'None' : (note.complicationsFreeText || 'Unspecified complication'),
        implants: note.implants || undefined,
        specimens: note.specimens || undefined,
        encounterId: String(encounterId),
        orgId,
      };

      const res = await fetch('/.netlify/functions/ai-operative-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data: AIDraftResponse = await res.json();
      const draft = data.operativeNoteDraft;

      if (draft?.procedureDetails) {
        set('description', draft.procedureDetails);
      }
      if (draft?.preoperativeDiagnosis && !note.preOpDx) {
        set('preOpDx', draft.preoperativeDiagnosis);
      }
      if (draft?.postoperativeDiagnosis && !note.postOpDx) {
        set('postOpDx', draft.postoperativeDiagnosis);
      }
      if (draft?.ebl && !note.eblMl) {
        set('eblMl', draft.ebl);
      }

      setAiFlags(data.qualityFlags ?? []);
      setAiPrompts(data.dictationPrompts ?? []);
      setAiScore(data.completenessScore ?? null);
      setAiStatus('idle');
    } catch (err) {
      console.error('AI draft error:', err);
      setAiStatus('error');
    }
  }, [selectedProc, note, encounterId, orgId, set]);

  // ── Timeline ──────────────────────────────────────────────────
  const addTimelineEntry = useCallback(() => {
    if (!newEntry.text.trim()) return;
    setTimeline(prev => [...prev, {
      id: crypto.randomUUID(),
      timestamp: nowTimestamp(),
      eventType: newEntry.type,
      text: newEntry.text.trim(),
    }]);
    setNewEntry(prev => ({ ...prev, text: '' }));
  }, [newEntry]);

  const removeTimelineEntry = useCallback((id: string) => {
    setTimeline(prev => prev.filter(e => e.id !== id));
  }, []);

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    setSaveError('');

    try {
      const noteContent = {
        procedure: note.selectedProcedureId,
        preOpDx: note.preOpDx,
        postOpDx: note.postOpDx,
        procedurePerformed: note.procedurePerformed,
        surgeon: note.surgeon,
        assistant: note.assistant,
        anesthesiaType: note.anesthesiaType,
        anesthesiologist: note.anesthesiologist,
        eblMl: note.eblMl,
        fluidsIn: note.fluidsIn,
        fluidsOut: note.fluidsOut,
        urineMl: note.urineMl,
        complications: note.complications === 'None' ? 'None' : note.complicationsFreeText,
        implants: note.implants,
        specimens: note.specimens,
        drains: note.drains,
        countsCorrect: note.countsCorrect,
        patientTolerance: note.patientTolerance,
        description: note.description,
        closingMethod: note.closingMethod,
        intraOpFindings: note.intraOpFindings,
        timeline,
      };

      const { data, error } = await supabase
        .schema('cr')
        .from('patient_notes')
        .insert({
          patient_id: patientId,
          encounter_id: encounterId,
          org_id: orgId,
          note_type: 'operative_note',
          content: noteContent,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      setSaveStatus('saved');
      if (onSave && data?.id) onSave(String(data.id));
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setSaveError('Save failed. Please try again.');
      setSaveStatus('error');
    }
  }, [note, timeline, patientId, encounterId, orgId, onSave]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{
      background: T.navy,
      minHeight: '100vh',
      color: T.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: 24,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${T.gold} 0%, ${T.goldDim} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={20} color={T.navy} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>Operative Note</div>
            <div style={{ fontSize: 12, color: T.textMuted }}>Intra-Operative Documentation</div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 22px',
            borderRadius: 8,
            border: 'none',
            background: saveStatus === 'saved'
              ? T.successBg
              : `linear-gradient(135deg, ${T.gold} 0%, ${T.goldDim} 100%)`,
            color: saveStatus === 'saved' ? T.success : T.navy,
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            opacity: saveStatus === 'saving' ? 0.7 : 1,
            transition: 'all 0.2s',
          }}
        >
          {saveStatus === 'saving' && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
          {saveStatus === 'saved' && <CheckCircle2 size={16} />}
          {saveStatus !== 'saving' && saveStatus !== 'saved' && <Save size={16} />}
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save Operative Note'}
        </button>
      </div>

      {saveStatus === 'error' && (
        <div style={{
          background: T.errorBg, border: `1px solid ${T.error}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8, color: T.error, fontSize: 14,
        }}>
          <AlertCircle size={16} />
          {saveError || 'An error occurred. Please try again.'}
        </div>
      )}

      {/* Universal Protocol time-out — gates the case before incision */}
      <TimeOutChecklist caseId={Number(patientId) || null} orgId={orgId} />

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── LEFT COLUMN — Procedure Selector ───────────────────── */}
        <div>
          <div style={card}>
            <SectionTitle icon={ClipboardList} title="Procedure" />

            {/* Search + dropdown trigger */}
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <div
                onClick={() => setShowProcedureDropdown(v => !v)}
                style={{
                  ...inputStyle,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', userSelect: 'none',
                  border: showProcedureDropdown ? `1px solid ${T.gold}` : `1px solid ${T.navyBorder}`,
                }}
              >
                <span style={{ color: selectedProc ? T.text : T.textDim, fontSize: 13 }}>
                  {selectedProc ? selectedProc.label : 'Select procedure...'}
                </span>
                <ChevronDown size={14} color={T.textMuted} style={{
                  transform: showProcedureDropdown ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s', flexShrink: 0,
                }} />
              </div>

              {showProcedureDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                  background: T.navyMid, border: `1px solid ${T.gold}`,
                  borderRadius: '0 0 8px 8px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  maxHeight: 420, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                }}>
                  {/* Search */}
                  <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.navyBorder}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Search size={14} color={T.textMuted} />
                      <input
                        autoFocus
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search procedures..."
                        style={{
                          ...inputStyle,
                          padding: '6px 0',
                          background: 'transparent',
                          border: 'none',
                          fontSize: 13,
                        }}
                      />
                    </div>
                  </div>

                  {/* Grouped list */}
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {Object.entries(grouped).map(([category, procs]) => (
                      <div key={category}>
                        <div style={{
                          padding: '8px 12px 4px',
                          fontSize: 10, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.08em',
                          color: T.goldDim,
                        }}>
                          {category}
                        </div>
                        {procs.map(proc => (
                          <div
                            key={proc.id}
                            onClick={() => selectProcedure(proc)}
                            style={{
                              padding: '9px 16px',
                              cursor: 'pointer',
                              fontSize: 13,
                              color: note.selectedProcedureId === proc.id ? T.gold : T.text,
                              background: note.selectedProcedureId === proc.id ? T.navyLight : 'transparent',
                              borderLeft: note.selectedProcedureId === proc.id ? `3px solid ${T.gold}` : '3px solid transparent',
                              transition: 'all 0.12s',
                            }}
                            onMouseEnter={e => {
                              if (note.selectedProcedureId !== proc.id) {
                                (e.currentTarget as HTMLDivElement).style.background = T.sectionBg;
                              }
                            }}
                            onMouseLeave={e => {
                              if (note.selectedProcedureId !== proc.id) {
                                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                              }
                            }}
                          >
                            {proc.label}
                          </div>
                        ))}
                      </div>
                    ))}
                    {Object.keys(grouped).length === 0 && (
                      <div style={{ padding: '20px 16px', color: T.textMuted, fontSize: 13, textAlign: 'center' }}>
                        No procedures matching "{searchQuery}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Selected procedure details */}
            {selectedProc && (
              <div style={{
                marginTop: 14,
                padding: '12px 14px',
                background: T.navyLight,
                borderRadius: 8,
                border: `1px solid ${T.navyBorder}`,
              }}>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Category</div>
                <div style={{
                  display: 'inline-block',
                  padding: '2px 10px',
                  borderRadius: 20,
                  background: T.goldDim + '33',
                  border: `1px solid ${T.goldDim}`,
                  color: T.gold,
                  fontSize: 11, fontWeight: 600,
                  marginBottom: 10,
                }}>
                  {selectedProc.category}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 2 }}>Approach</div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{selectedProc.approach}</div>
              </div>
            )}
          </div>

          {/* ── Intra-Op Timeline ─────────────────────────────── */}
          <div style={card}>
            <SectionTitle icon={Clock} title="Intra-Op Timeline" color="#5AC8FA" />

            {/* Add entry */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <label style={label}>Event Type</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={newEntry.type}
                    onChange={e => setNewEntry(prev => ({ ...prev, type: e.target.value as TimelineEventType }))}
                    style={{
                      ...selectStyle,
                      borderColor: EVENT_COLORS[newEntry.type] + '80',
                    }}
                  >
                    {(Object.keys(EVENT_LABELS) as TimelineEventType[]).map(t => (
                      <option key={t} value={t}>{EVENT_LABELS[t]}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} color={T.textMuted} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={label}>Event Details</label>
                <input
                  value={newEntry.text}
                  onChange={e => setNewEntry(prev => ({ ...prev, text: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addTimelineEntry()}
                  placeholder="Describe the event..."
                  style={inputStyle}
                />
              </div>
              <button
                onClick={addTimelineEntry}
                disabled={!newEntry.text.trim()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 6,
                  border: `1px solid ${T.navyBorder}`,
                  background: T.navyLight,
                  color: T.text, fontSize: 12, fontWeight: 600,
                  cursor: newEntry.text.trim() ? 'pointer' : 'not-allowed',
                  opacity: newEntry.text.trim() ? 1 : 0.5,
                  width: '100%', justifyContent: 'center',
                }}
              >
                <Plus size={13} /> Log Entry
              </button>
            </div>

            {/* Timeline list */}
            {timeline.length === 0 ? (
              <div style={{ textAlign: 'center', color: T.textDim, fontSize: 12, padding: '8px 0' }}>
                No events logged yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {timeline.map((entry) => (
                  <div key={entry.id} style={{
                    display: 'flex', gap: 10, padding: '10px 12px',
                    background: T.sectionBg, borderRadius: 8,
                    border: `1px solid ${EVENT_COLORS[entry.eventType]}33`,
                    borderLeft: `3px solid ${EVENT_COLORS[entry.eventType]}`,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                          color: EVENT_COLORS[entry.eventType], letterSpacing: '0.05em',
                        }}>
                          {EVENT_LABELS[entry.eventType]}
                        </span>
                        <span style={{ fontSize: 10, color: T.textDim }}>{entry.timestamp}</span>
                      </div>
                      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{entry.text}</div>
                    </div>
                    <button
                      onClick={() => removeTimelineEntry(entry.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: T.textDim, flexShrink: 0 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN — Note Form ──────────────────────────── */}
        <div>

          {/* ── Diagnoses & Procedure ────────────────────────────── */}
          <div style={card}>
            <SectionTitle icon={Stethoscope} title="Diagnoses & Procedure" />
            <div style={fieldGroup('1fr 1fr')}>
              <div>
                <label style={label}>Pre-Operative Diagnosis</label>
                <input value={note.preOpDx} onChange={e => set('preOpDx', e.target.value)} placeholder="Pre-op diagnosis" style={inputStyle} />
              </div>
              <div>
                <label style={label}>Post-Operative Diagnosis</label>
                <input value={note.postOpDx} onChange={e => set('postOpDx', e.target.value)} placeholder="Post-op diagnosis" style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={label}>Procedure Performed</label>
              <input value={note.procedurePerformed} onChange={e => set('procedurePerformed', e.target.value)} placeholder="Full procedure name" style={inputStyle} />
            </div>
          </div>

          {/* ── Team ──────────────────────────────────────────────── */}
          <div style={card}>
            <SectionTitle icon={Activity} title="Operative Team" />
            <div style={fieldGroup('1fr 1fr')}>
              <div>
                <label style={label}>Surgeon</label>
                <input value={note.surgeon} onChange={e => set('surgeon', e.target.value)} placeholder="Attending surgeon" style={inputStyle} />
              </div>
              <div>
                <label style={label}>Assistant</label>
                <input value={note.assistant} onChange={e => set('assistant', e.target.value)} placeholder="Resident / PA / NP" style={inputStyle} />
              </div>
              <div>
                <label style={label}>Anesthesia Type</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={note.anesthesiaType}
                    onChange={e => set('anesthesiaType', e.target.value as AnesthesiaType)}
                    style={selectStyle}
                  >
                    <option value="">Select...</option>
                    {ANESTHESIA_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <ChevronDown size={12} color={T.textMuted} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
              </div>
              <div>
                <label style={label}>Anesthesiologist</label>
                <input value={note.anesthesiologist} onChange={e => set('anesthesiologist', e.target.value)} placeholder="Name" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* ── Hemodynamics & Fluids ─────────────────────────────── */}
          <div style={card}>
            <SectionTitle icon={Activity} title="Hemodynamics & Fluids" color="#5AC8FA" />
            <div style={fieldGroup('1fr 1fr 1fr 1fr')}>
              <div>
                <label style={label}>EBL (mL)</label>
                <input value={note.eblMl} onChange={e => set('eblMl', e.target.value)} placeholder="e.g. 50" style={inputStyle} type="text" inputMode="numeric" />
              </div>
              <div>
                <label style={label}>Fluids In (mL)</label>
                <input value={note.fluidsIn} onChange={e => set('fluidsIn', e.target.value)} placeholder="e.g. 1500" style={inputStyle} type="text" inputMode="numeric" />
              </div>
              <div>
                <label style={label}>Fluids Out (mL)</label>
                <input value={note.fluidsOut} onChange={e => set('fluidsOut', e.target.value)} placeholder="e.g. 200" style={inputStyle} type="text" inputMode="numeric" />
              </div>
              <div>
                <label style={label}>Urine Output (mL)</label>
                <input value={note.urineMl} onChange={e => set('urineMl', e.target.value)} placeholder="e.g. 150" style={inputStyle} type="text" inputMode="numeric" />
              </div>
            </div>
          </div>

          {/* ── Intraoperative Findings ───────────────────────────── */}
          <div style={card}>
            <SectionTitle icon={FlaskConical} title="Intraoperative Findings" />
            <textarea
              value={note.intraOpFindings}
              onChange={e => set('intraOpFindings', e.target.value)}
              placeholder="Describe intraoperative findings (used for AI draft generation)..."
              rows={3}
              style={textareaStyle}
            />
          </div>

          {/* ── Complications ─────────────────────────────────────── */}
          <div style={card}>
            <SectionTitle icon={AlertTriangle} title="Complications" color={T.warning} />
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              {(['None', 'Complication occurred'] as const).map(opt => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', userSelect: 'none' }}>
                  <div
                    onClick={() => set('complications', opt)}
                    style={{
                      width: 16, height: 16, borderRadius: '50%',
                      border: `2px solid ${note.complications === opt ? T.gold : T.navyBorder}`,
                      background: note.complications === opt ? T.gold : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {note.complications === opt && <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.navy }} />}
                  </div>
                  <span style={{ fontSize: 13, color: T.text }}>{opt}</span>
                </label>
              ))}
            </div>
            {note.complications !== 'None' && (
              <textarea
                value={note.complicationsFreeText}
                onChange={e => set('complicationsFreeText', e.target.value)}
                placeholder="Describe complication(s) in detail..."
                rows={3}
                style={{ ...textareaStyle, borderColor: T.warning + '80' }}
              />
            )}
          </div>

          {/* ── Implants, Specimens, Drains ───────────────────────── */}
          <div style={card}>
            <SectionTitle icon={ClipboardList} title="Implants / Specimens / Drains" />
            <div style={rowStyle}>
              <div>
                <label style={label}>Implants & Devices (mesh type, stapler, clips)</label>
                <textarea value={note.implants} onChange={e => set('implants', e.target.value)} rows={2} placeholder="e.g. Hem-o-lok clips; 12-mm linear stapler; 15 × 10 cm polypropylene mesh" style={textareaStyle} />
              </div>
              <div>
                <label style={label}>Specimens Sent</label>
                <textarea value={note.specimens} onChange={e => set('specimens', e.target.value)} rows={2} placeholder="e.g. Gallbladder with bile and stones — pathology" style={textareaStyle} />
              </div>
              <div>
                <label style={label}>Drains (type, location, output)</label>
                <input value={note.drains} onChange={e => set('drains', e.target.value)} placeholder="e.g. JP drain — RUQ; serosanguinous; 20 mL intraop" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* ── Safety Counts & Tolerance ─────────────────────────── */}
          <div style={card}>
            <SectionTitle icon={CheckSquare} title="Safety Checks" color={T.success} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <CheckboxField
                checked={note.countsCorrect}
                onChange={v => set('countsCorrect', v)}
                label="Sponge, instrument, and needle counts correct × 3 per circulator"
              />
              <div>
                <label style={label}>Patient Tolerance</label>
                <input
                  value={note.patientTolerance}
                  onChange={e => set('patientTolerance', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* ── Procedure Description (AI Draft) ─────────────────── */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${T.navyBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} color={T.gold} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Procedure Description
                </span>
              </div>
              <button
                onClick={handleAIDraft}
                disabled={!selectedProc || aiStatus === 'loading'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 6,
                  border: `1px solid ${T.goldDim}`,
                  background: T.navyLight,
                  color: T.gold, fontSize: 12, fontWeight: 600,
                  cursor: selectedProc && aiStatus !== 'loading' ? 'pointer' : 'not-allowed',
                  opacity: selectedProc && aiStatus !== 'loading' ? 1 : 0.5,
                  transition: 'all 0.15s',
                }}
              >
                {aiStatus === 'loading'
                  ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Sparkles size={13} />}
                {aiStatus === 'loading' ? 'Generating...' : 'AI Draft'}
              </button>
            </div>

            {aiStatus === 'error' && (
              <div style={{
                background: T.errorBg, border: `1px solid ${T.error}`,
                borderRadius: 7, padding: '10px 14px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 8, color: T.error, fontSize: 13,
              }}>
                <AlertCircle size={14} />
                AI service unavailable. Please dictate the note manually.
              </div>
            )}

            {aiScore !== null && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                padding: '10px 14px',
                background: T.navyLight, borderRadius: 7,
                border: `1px solid ${T.navyBorder}`,
              }}>
                <div style={{ fontSize: 12, color: T.textMuted }}>AI Completeness Score:</div>
                <div style={{
                  fontSize: 14, fontWeight: 700,
                  color: aiScore >= 80 ? T.success : aiScore >= 50 ? T.warning : T.error,
                }}>
                  {aiScore}%
                </div>
                <div style={{ flex: 1, height: 4, background: T.navyBorder, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${aiScore}%`,
                    background: aiScore >= 80 ? T.success : aiScore >= 50 ? T.warning : T.error,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            )}

            {aiFlags.length > 0 && (
              <div style={{
                background: T.warningBg, border: `1px solid ${T.warning}66`,
                borderRadius: 7, padding: '10px 14px', marginBottom: 12,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.warning, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Quality Flags
                </div>
                {aiFlags.map((flag, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: T.text, marginBottom: 3 }}>
                    <AlertTriangle size={12} color={T.warning} style={{ flexShrink: 0, marginTop: 2 }} />
                    {flag}
                  </div>
                ))}
              </div>
            )}

            {aiPrompts.length > 0 && (
              <div style={{
                background: T.sectionBg, border: `1px solid ${T.navyBorder}`,
                borderRadius: 7, padding: '10px 14px', marginBottom: 12,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Dictation Prompts
                </div>
                {aiPrompts.map((prompt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: T.textMuted, marginBottom: 3 }}>
                    <span style={{ color: T.gold, fontWeight: 700 }}>{i + 1}.</span>
                    {prompt}
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={note.description}
              onChange={e => set('description', e.target.value)}
              rows={18}
              placeholder={selectedProc
                ? 'Select "AI Draft" to generate a template, or type the operative description...'
                : 'Select a procedure to load the description template...'}
              style={{
                ...textareaStyle,
                fontSize: 13,
                lineHeight: 1.7,
                fontFamily: '"SF Mono", "Fira Code", "Fira Mono", monospace',
              }}
            />
          </div>

          {/* ── Closing Method ────────────────────────────────────── */}
          <div style={card}>
            <SectionTitle icon={CheckCircle2} title="Closing Method" color={T.success} />
            <textarea
              value={note.closingMethod}
              onChange={e => set('closingMethod', e.target.value)}
              rows={2}
              placeholder="Describe wound closure layers and suture materials..."
              style={textareaStyle}
            />
          </div>

          {/* ── Save footer ───────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 28px', borderRadius: 8,
                border: 'none',
                background: saveStatus === 'saved'
                  ? T.successBg
                  : `linear-gradient(135deg, ${T.gold} 0%, ${T.goldDim} 100%)`,
                color: saveStatus === 'saved' ? T.success : T.navy,
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
                opacity: saveStatus === 'saving' ? 0.7 : 1,
              }}
            >
              {saveStatus === 'saving' && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
              {saveStatus === 'saved' && <CheckCircle2 size={16} />}
              {saveStatus !== 'saving' && saveStatus !== 'saved' && <Save size={16} />}
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save Operative Note'}
            </button>
          </div>

        </div>
      </div>

      {/* Intra-op clinical records on the shared case spine */}
      <AnesthesiaRecord caseId={Number(patientId) || null} patientId={patientId} encounterId={encounterId} orgId={orgId} />
      <MARPanel caseId={Number(patientId) || null} orgId={orgId} />
      <ImplantPanel caseId={Number(patientId) || null} orgId={orgId} />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder, textarea::placeholder { color: ${T.textDim}; }
        input:focus, textarea:focus, select:focus { outline: none; border-color: ${T.gold} !important; }
        select option { background: ${T.navyMid}; color: ${T.text}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${T.navy}; }
        ::-webkit-scrollbar-thumb { background: ${T.navyBorder}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.gold}66; }
      `}</style>
    </div>
  );
};

export default OperativeModule;
