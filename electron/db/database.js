/**
 * Bail Reckoner – Offline SQLite Database (sql.js / WASM)
 *
 * Uses sql.js (pure WASM, zero native build issues) so electron-builder
 * packages cleanly on macOS / Windows / Linux without node-gyp.
 *
 * Data is persisted to: app.getPath('userData')/bail_reckoner.sqlite
 *
 * Tables
 * ──────
 *  statutes_sections         – Indian statutory provisions (IPC, BNS, BNSS, BSA, 7 special statutes)
 *  judicial_pronouncements   – Landmark Supreme Court bail judgments
 *  cases                     – Undertrial case records
 *  seed_meta                 – Internal flag to avoid re-seeding
 */

'use strict'

const path = require('path')
const fs   = require('fs')
const { app } = require('electron')
const {
  calculateCustodyProgress,
  calculateRiskIndex,
  assessNature,
  determineVerdict,
} = require('../engine/bailCalculator')

// ─── Module-level singletons ─────────────────────────────────────────────────
let _db          = null
let _dbPath      = null
let _initPromise = null

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDb () {
  if (!_db) throw new Error('[DB] Not initialised – call initDatabase() first.')
  return _db
}

/** SELECT with bind params → array of plain objects */
function query (sql, params = []) {
  const db   = ensureDb()
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

/** INSERT / UPDATE / DELETE → last_insert_rowid (or null) */
function run (sql, params = []) {
  const db = ensureDb()
  db.run(sql, params)
  const r = db.exec('SELECT last_insert_rowid() AS id')
  return r?.[0]?.values?.[0]?.[0] ?? null
}

/** Persist in-memory database to disk */
function saveDatabase () {
  if (!_db || !_dbPath) return
  try {
    const data = _db.export()
    fs.writeFileSync(_dbPath, Buffer.from(data))
  } catch (err) {
    console.error('[DB] Save failed:', err.message)
  }
}

/** Parse JSON columns on case rows */
function parseCase (row) {
  if (!row) return null
  return {
    ...row,
    charges_json:             safeParse(row.charges_json,             []),
    procedural_checklist_json: safeParse(row.procedural_checklist_json, {}),
  }
}

function safeParse (str, fallback) {
  try { return JSON.parse(str) } catch { return fallback }
}

// ─── DDL ─────────────────────────────────────────────────────────────────────

function createTables (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS statutes_sections (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      act_code              TEXT    NOT NULL,
      section_number        TEXT    NOT NULL,
      title                 TEXT    NOT NULL,
      description           TEXT,
      max_punishment_years  REAL    DEFAULT 0,
      is_bailable           INTEGER DEFAULT 0,
      is_compoundable       INTEGER DEFAULT 0,
      is_cognizable         INTEGER DEFAULT 0,
      special_category      TEXT,
      default_bond_type     TEXT    DEFAULT 'surety_bond',
      typical_fine_inr      INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS judicial_pronouncements (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      case_name        TEXT NOT NULL,
      citation         TEXT NOT NULL,
      year             INTEGER NOT NULL,
      court            TEXT NOT NULL,
      summary          TEXT NOT NULL,
      applicable_tags  TEXT NOT NULL,
      key_principle    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cases (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number               TEXT UNIQUE NOT NULL,
      prisoner_name             TEXT NOT NULL,
      age                       INTEGER,
      gender                    TEXT,
      is_first_time_offender    INTEGER DEFAULT 0,
      custody_start_date        TEXT NOT NULL,
      charges_json              TEXT DEFAULT '[]',
      flight_risk_score         INTEGER DEFAULT 5,
      witness_influence_score   INTEGER DEFAULT 5,
      evidence_tampering_score  INTEGER DEFAULT 5,
      prior_convictions         INTEGER DEFAULT 0,
      local_ties_verified       INTEGER DEFAULT 0,
      procedural_checklist_json TEXT DEFAULT '{}',
      status                    TEXT DEFAULT 'undertrial',
      notes                     TEXT,
      created_at                TEXT DEFAULT (datetime('now')),
      updated_at                TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seed_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `)
}

// ─── Seed data ────────────────────────────────────────────────────────────────

function seedStatutes (db) {
  //  [act_code, section_number, title, description,
  //   max_punishment_years, is_bailable, is_compoundable, is_cognizable,
  //   special_category, default_bond_type, typical_fine_inr]
  const rows = [
    // ── IPC 1860 (IDs 1-11) ────────────────────────────────────────────────
    ['IPC','302','Murder',
     'Whoever commits murder shall be punished with death or imprisonment for life and shall also be liable to fine.',
     -1,0,0,1,null,'surety_bond',0],

    ['IPC','304-I','Culpable Homicide – Part I',
     'Culpable homicide not amounting to murder where the act is done with intent to cause death or such bodily injury as is likely to cause death.',
     -1,0,0,1,null,'surety_bond',0],

    ['IPC','304-II','Culpable Homicide – Part II',
     'Culpable homicide not amounting to murder where the act is done with knowledge that it is likely to cause death but without intent to cause death.',
     10,0,0,1,null,'surety_bond',0],

    ['IPC','304A','Causing Death by Negligence',
     'Causing death by a rash or negligent act not amounting to culpable homicide; imprisonment up to 2 years, or fine, or both.',
     2,1,0,1,null,'personal_bond',1000],

    ['IPC','307','Attempt to Murder',
     'Whoever does any act with intention or knowledge and under such circumstances that if death were thereby caused the act would amount to murder.',
     10,0,0,1,null,'surety_bond',0],

    ['IPC','376','Rape',
     'Rigorous imprisonment for a term not less than 7 years but which may extend to life imprisonment, with fine.',
     14,0,0,1,'WOMEN_PROTECTION','surety_bond',0],

    ['IPC','379','Theft',
     'Imprisonment of either description for a term up to 3 years, or fine, or both.',
     3,1,1,1,null,'personal_bond',5000],

    ['IPC','380','Theft in Dwelling House',
     'Theft in a building, tent or vessel used as a human dwelling or for custody of property; up to 7 years and fine.',
     7,0,0,1,null,'surety_bond',0],

    ['IPC','395','Dacoity',
     'Whoever commits dacoity shall be punished with imprisonment for life or rigorous imprisonment up to 10 years and fine.',
     -1,0,0,1,null,'surety_bond',0],

    ['IPC','420','Cheating & Dishonest Inducement',
     'Cheating and thereby dishonestly inducing delivery of property or alteration of a valuable security; up to 7 years and fine.',
     7,0,0,1,null,'surety_bond',0],

    ['IPC','498A','Matrimonial Cruelty',
     'Husband or relative of husband subjecting a woman to cruelty; imprisonment up to 3 years and fine.',
     3,0,0,1,'WOMEN_PROTECTION','surety_bond',0],

    // ── BNS 2023 (IDs 12-21) ───────────────────────────────────────────────
    ['BNS_2023','103','Murder (BNS)',
     'Replaces IPC §302. Whoever commits murder — punishment: death or imprisonment for life and fine.',
     -1,0,0,1,null,'surety_bond',0],

    ['BNS_2023','105','Culpable Homicide (BNS)',
     'Replaces IPC §304. Culpable homicide not amounting to murder; Part I — life or up to 10 years; Part II — up to 10 years.',
     -1,0,0,1,null,'surety_bond',0],

    ['BNS_2023','106','Causing Death by Negligence (BNS)',
     'Replaces IPC §304A. Enhanced: negligent driving causing death — up to 5 years; must not flee scene.',
     5,1,0,1,null,'personal_bond',2000],

    ['BNS_2023','109','Attempt to Murder (BNS)',
     'Replaces IPC §307. Attempt to commit murder; imprisonment up to 10 years and fine.',
     10,0,0,1,null,'surety_bond',0],

    ['BNS_2023','64','Rape (BNS)',
     'Replaces IPC §376. Rigorous imprisonment not less than 10 years, extending to life, and fine.',
     20,0,0,1,'WOMEN_PROTECTION','surety_bond',0],

    ['BNS_2023','303','Theft (BNS)',
     'Replaces IPC §379. Imprisonment up to 3 years, or fine, or both.',
     3,1,1,1,null,'personal_bond',5000],

    ['BNS_2023','318','Cheating (BNS)',
     'Replaces IPC §420. Cheating and dishonest inducement; up to 7 years and fine.',
     7,0,0,1,null,'surety_bond',0],

    ['BNS_2023','85','Cruelty by Husband (BNS)',
     'Replaces IPC §498A. Cruelty by husband or his relatives; imprisonment up to 3 years and fine.',
     3,0,0,1,'WOMEN_PROTECTION','surety_bond',0],

    ['BNS_2023','111','Organised Crime',
     'New provision under BNS. Participation in organised crime — rigorous imprisonment of 5 years to life and fine.',
     -1,0,0,1,null,'surety_bond',0],

    ['BNS_2023','113','Terrorist Act (BNS)',
     'New provision under BNS §113. Terrorist act causing death — death or rigorous imprisonment for life.',
     -1,0,0,1,'UAPA','surety_bond',0],

    // ── BNSS 2023 Procedural (IDs 22-24) ───────────────────────────────────
    ['BNSS_2023','479','Maximum Period of Detention / Half-Term Rule',
     'Replaces CrPC §436A. Person who has undergone half the maximum period of imprisonment shall be released on personal bond. First-time offenders eligible at 1/3rd of maximum term.',
     0,1,0,0,null,'personal_bond',0],

    ['BNSS_2023','480','Bail in Bailable Offences',
     'Replaces CrPC §436. Any person accused of a bailable offence who is arrested shall be released on bail as a matter of right.',
     0,1,0,0,null,'personal_bond',0],

    ['BNSS_2023','483','Direction for Bail by High Court or Court of Session',
     'Replaces CrPC §439. High Court or Court of Session may direct that any person accused of an offence be released on bail.',
     0,0,0,0,null,'surety_bond',0],

    // ── BSA 2023 (Bharatiya Sakshya Adhiniyam — Evidentiary Provisions) ────
    ['BSA_2023','23','Confession to Police Officer & Custody Discovery',
     'Replaces IEA §§25-27. Confession made to a police officer cannot be proved against an accused; only distinct facts discovered in consequence of information from accused in custody are admissible.',
     0,1,0,0,null,'personal_bond',0],

    ['BSA_2023','63','Admissibility of Electronic Records',
     'Replaces IEA §65B. Electronic record is admissible only when accompanied by a statutory certificate signed by the person in charge of the device and an expert.',
     0,1,0,0,'CYBER','personal_bond',0],

    ['BSA_2023','117','Presumption as to Abetment of Suicide by Married Woman',
     'Replaces IEA §113A. Court may presume abetment of suicide by husband or relative where suicide occurs within 7 years of marriage and cruelty is shown.',
     0,0,0,0,'WOMEN_PROTECTION','surety_bond',0],

    // ── IT Act / Cyber (IDs 25-28) ─────────────────────────────────────────
    ['CYBER_IT_ACT','66','Computer Related Offences',
     'Dishonestly or fraudulently doing any act under §43 — imprisonment up to 3 years, or fine up to ₹5 lakh, or both.',
     3,0,0,1,'CYBER','surety_bond',500000],

    ['CYBER_IT_ACT','66C','Identity Theft',
     'Fraudulent use of another person\'s electronic signature, password or unique identification feature — imprisonment up to 3 years and fine up to \u20b91 lakh.',
     3,1,0,1,'CYBER','personal_bond',100000],

    ['CYBER_IT_ACT','67','Publishing Obscene Material Electronically',
     'Publishing or transmitting obscene material in electronic form — first offence: up to 3 years and fine up to ₹5 lakh.',
     3,1,0,1,'CYBER','personal_bond',500000],

    ['CYBER_IT_ACT','66B','Receiving Stolen Computer Resource',
     'Dishonestly receiving a stolen computer resource or communication device — imprisonment up to 3 years, or fine up to ₹1 lakh, or both.',
     3,1,0,1,'CYBER','personal_bond',100000],

    // ── SC/ST Act (IDs 29-31) ──────────────────────────────────────────────
    ['SC_ST_ACT','3(1)','Atrocities Against SC/ST Members',
     'Whoever, not being a member of a SC/ST, commits an offence of atrocity (physical, verbal, or social) against an SC/ST member — imprisonment 6 months to 5 years and fine.',
     5,0,0,1,'SC_ST','surety_bond',0],

    ['SC_ST_ACT','3(2)','Aggravated Atrocities Resulting in Injury/Death',
     'An IPC-defined offence committed against an SC/ST member attracts enhanced punishment up to 10 years where resulting in grievous hurt or death.',
     10,0,0,1,'SC_ST','surety_bond',0],

    ['SC_ST_ACT','14A','No Anticipatory Bail',
     'Courts are not empowered to grant anticipatory bail for offences under the SC/ST Atrocities Act; Sessions Court has exclusive trial jurisdiction.',
     0,0,0,1,'SC_ST','surety_bond',0],

    // ── Women Protection (IDs 32-34) ───────────────────────────────────────
    ['WOMEN_PROTECTION','354','Assault on Woman to Outrage Modesty',
     'Assault or criminal force on a woman with intent to outrage her modesty — imprisonment 1 to 5 years and fine.',
     5,0,0,1,'WOMEN_PROTECTION','surety_bond',0],

    ['WOMEN_PROTECTION','17-DV','Right to Reside – Protection of Women from DV Act',
     'Under the DV Act 2005, a woman has the right to reside in a shared household; breach of protection order is criminal.',
     1,1,0,1,'WOMEN_PROTECTION','personal_bond',20000],

    ['WOMEN_PROTECTION','509','Word/Gesture Insulting Woman\'s Modesty',
     'Word, gesture or act intended to insult the modesty of a woman — imprisonment up to 3 years and fine.',
     3,1,1,0,'WOMEN_PROTECTION','personal_bond',1000],

    // ── POCSO (IDs 35-37) ─────────────────────────────────────────────────
    ['POCSO_CHILDREN','4','Penetrative Sexual Assault on Child (POCSO)',
     'Punishment for penetrative sexual assault — not less than 10 years rigorous imprisonment, extending to life, and fine.',
     20,0,0,1,'POCSO','surety_bond',0],

    ['POCSO_CHILDREN','8','Sexual Assault on Child (POCSO)',
     'Punishment for sexual assault on child — not less than 3 years rigorous imprisonment, extending to 5 years, and fine.',
     5,0,0,1,'POCSO','surety_bond',0],

    ['POCSO_CHILDREN','12','Sexual Harassment of Child (POCSO)',
     'Punishment for sexual harassment of child — imprisonment up to 3 years, or fine, or both.',
     3,0,0,1,'POCSO','surety_bond',0],

    // ── UAPA (IDs 38-40) ──────────────────────────────────────────────────
    ['STATE_OFFENCES_UAPA','15','Terrorist Act (UAPA)',
     'Unlawful Activities (Prevention) Act §15 — doing any act with intent to threaten or likely to threaten the unity, integrity, security or sovereignty of India.',
     -1,0,0,1,'UAPA','surety_bond',0],

    ['STATE_OFFENCES_UAPA','16','Punishment for Terrorist Act (UAPA)',
     'UAPA §16 — Whoever commits a terrorist act shall be punished with death or life imprisonment (if causing death) or rigorous imprisonment 5 years to life otherwise.',
     -1,0,0,1,'UAPA','surety_bond',0],

    ['STATE_OFFENCES_UAPA','43D','Special Provisions for Bail (UAPA)',
     'UAPA §43D(5) — No person accused of an offence under Chapters IV or VI shall be released on bail unless court is satisfied that accusations are prima facie not true.',
     0,0,0,1,'UAPA','surety_bond',0],

    // ── PMLA (IDs 41-43) ──────────────────────────────────────────────────
    ['ECONOMIC_PMLA','3','Money Laundering Offence (PMLA)',
     'Whoever directly or indirectly attempts to indulge in or assists in money laundering commits an offence under PMLA §3.',
     7,0,0,1,'PMLA','surety_bond',0],

    ['ECONOMIC_PMLA','4','Punishment for Money Laundering (PMLA)',
     'Rigorous imprisonment 3-7 years and fine; in scheduled narcotic offences — up to 10 years rigorous imprisonment.',
     10,0,0,1,'PMLA','surety_bond',0],

    ['ECONOMIC_PMLA','45','Twin Conditions for Bail (PMLA)',
     'PMLA §45 — Bail shall not be granted unless: (i) PP given opportunity to oppose; (ii) court satisfied accused is not guilty AND unlikely to commit offence while on bail.',
     0,0,0,1,'PMLA','surety_bond',0],

    // ── Foreigners Act (IDs 44-45) ─────────────────────────────────────────
    ['FOREIGNERS_ACT','14','Contravention of Foreigners Act Provisions',
     'Whoever contravenes any provisions of the Foreigners Act or any order/direction made thereunder — imprisonment up to 5 years or fine or both.',
     5,1,0,1,'FOREIGNERS','personal_bond',0],

    ['FOREIGNERS_ACT','14A','Illegal Entry / Overstay',
     'Whoever enters India without valid travel documents or overstays after expiry of visa — imprisonment up to 5 years and fine.',
     5,0,0,1,'FOREIGNERS','surety_bond',0],
  ]

  const sql = `INSERT INTO statutes_sections
    (act_code,section_number,title,description,max_punishment_years,
     is_bailable,is_compoundable,is_cognizable,special_category,default_bond_type,typical_fine_inr)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`

  for (const row of rows) db.run(sql, row)
}

function seedPronouncements (db) {
  const rows = [
    // [case_name, citation, year, court, summary, applicable_tags (JSON), key_principle]
    ['Satender Kumar Antil v. Central Bureau of Investigation',
     '(2022) 10 SCC 51', 2022, 'Supreme Court of India',
     'Comprehensive guidelines issued for bail in cases carrying up to 7-year punishment. Directed that accused in such cases should not be unnecessarily arrested. Reinforced Section 436A CrPC.',
     JSON.stringify(['half_term','bail_guidelines','undertrial','under_7_years','arrest_guidelines']),
     'Courts must not incarcerate accused for offences carrying up to 7 years as a matter of course. Section 436A/479 half-term bail is a right, not a concession.'],

    ['Arnesh Kumar v. State of Bihar',
     '(2014) 8 SCC 273', 2014, 'Supreme Court of India',
     'Landmark ruling on arrest guidelines for offences punishable up to 7 years. Police must apply their mind and satisfy checklist before arresting; magistrate must apply judicial mind before authorising remand.',
     JSON.stringify(['arrest_guidelines','under_7_years','women','bail_principles']),
     'Arrest is not a must for every offence under 7 years. Police officer must be satisfied that arrest is necessary. Magistrate must not routinely authorise custody without independent application of mind.'],

    ['Sanjay Chandra v. Central Bureau of Investigation',
     '(2012) 1 SCC 40', 2012, 'Supreme Court of India',
     'Bail in 2G spectrum economic offence case. Court held that bail is the rule and jail the exception even in serious economic crimes. Personal liberty cannot be sacrificed at the altar of investigation.',
     JSON.stringify(['economic','bail_principles','flight_risk','bail_conditions']),
     'The object of bail is to secure the attendance of the accused at the trial. Gravity of economic offence alone is not sufficient to deny bail; individual case merits must be assessed.'],

    ['Bhim Singh v. Union of India',
     '(2015) 13 SCC 605', 2015, 'Supreme Court of India',
     'Supreme Court directed all High Courts to monitor undertrial prisoners who have served half the maximum sentence. Issued specific directions for release under Section 436A CrPC.',
     JSON.stringify(['undertrial','half_term','bail_guidelines','speedy_trial']),
     'State has an obligation to ensure that undertrials who have served 50% of maximum sentence are identified and released. High Courts must supervise jail undertrial review committees.'],

    ['Hussainara Khatoon v. State of Bihar',
     '(1979) 3 SCC 1', 1979, 'Supreme Court of India',
     'Foundational judgment on undertrial prisoners\' rights. Declared right to speedy trial as a fundamental right under Article 21. Thousands of undertrials released who had served more than their maximum sentences.',
     JSON.stringify(['undertrial','speedy_trial','fundamental_rights','half_term','bail_principles']),
     'The right to a speedy trial is a fundamental right under Article 21 of the Constitution. No person can be detained for a period beyond the maximum sentence provided for the offence.'],

    ['Nikesh Tarachand Shah v. Union of India',
     '(2018) 11 SCC 1', 2018, 'Supreme Court of India',
     'PMLA Section 45 twin conditions struck down as manifestly arbitrary and unconstitutional (later restored by amendment). Court held conditions violated Article 14 and 21.',
     JSON.stringify(['pmla','economic','twin_conditions','bail_conditions']),
     'Twin conditions for bail under PMLA §45 must be applied with constitutional safeguards. Even under special statutes, bail conditions must conform to Articles 14 and 21. Prolonged incarceration without trial is unconstitutional.'],

    ['Dataram Singh v. State of Uttar Pradesh',
     '(2018) 3 SCC 22', 2018, 'Supreme Court of India',
     'Enumerated the factors a court must consider while deciding bail: nature of accusation, severity of punishment, character of accused, flight risk, likelihood of repeating offence, and interests of society.',
     JSON.stringify(['bail_principles','bail_conditions','flight_risk','general']),
     'Bail decisions must be reasoned, case-specific, and proportionate. Courts must weigh personal liberty against public interest. Neither punitive nor casual incarceration is permissible.'],

    ['State of Rajasthan v. Balchand',
     '(1977) 4 SCC 308', 1977, 'Supreme Court of India',
     'Seminal pronouncement establishing the foundational principle that bail is the rule and jail is the exception in Indian criminal jurisprudence.',
     JSON.stringify(['bail_principles','general','bailable']),
     'The basic rule is bail, not jail. Except where there is specific reason to believe that the accused will flee, tamper with evidence, or reoffend, personal liberty must be protected.'],

    ['P. Chidambaram v. Directorate of Enforcement',
     '(2020) 13 SCC 452', 2020, 'Supreme Court of India',
     'Bail denied in economic offence / money laundering case; court weighed public position, severity of offence, evidence tampering risk and flight risk. PMLA twin conditions satisfied.',
     JSON.stringify(['economic','pmla','twin_conditions','flight_risk','bail_conditions']),
     'In economic offences involving high-profile accused, courts may consider the accused\'s position, resources for flight, and evidence control capacity. PMLA twin conditions applied strictly.'],

    ['Union of India v. K.A. Najeeb',
     '(2021) 3 SCC 713', 2021, 'Supreme Court of India',
     'Despite UAPA restrictions, Supreme Court held that Constitutional courts retain the power to grant bail when prolonged incarceration violates Article 21 of the Constitution.',
     JSON.stringify(['uapa','bail_conditions','long_incarceration','fundamental_rights','twin_conditions']),
     'Statutory restrictions on bail (UAPA §43D) do not entirely oust the jurisdiction of Constitutional courts. When incarceration is prolonged and trial not in sight, Article 21 override applies.'],

    ['Gurbaksh Singh Sibbia v. State of Punjab',
     '(1980) 2 SCC 565', 1980, 'Supreme Court of India',
     'Landmark Constitution Bench judgment establishing the scope, purpose, and procedure for anticipatory bail under Section 438 CrPC; liberal approach to anticipatory bail directed.',
     JSON.stringify(['anticipatory_bail','bail_principles','general']),
     'Anticipatory bail is a device to secure personal liberty. Courts must not impose onerous conditions; a broad, liberal approach guided by facts and circumstances of each case must be adopted.'],
  ]

  const sql = `INSERT INTO judicial_pronouncements
    (case_name,citation,year,court,summary,applicable_tags,key_principle)
    VALUES (?,?,?,?,?,?,?)`

  for (const row of rows) db.run(sql, row)
}

function seedCases (db) {
  // Current reference date: 23 Nov 2026
  // Custody dates are chosen so Cases 1 & 2 clearly cross the 50% half-term threshold.
  const rows = [
    // [case_number, prisoner_name, age, gender, is_first_time_offender,
    //  custody_start_date, charges_json, flight_risk, witness_influence, evidence_tampering,
    //  prior_convictions, local_ties_verified, procedural_checklist_json, status, notes]

    // Case 1 – Ratan Lal: IPC 304A (2yr max), custody 25 Oct 2025 → ~394 days > 365 half-term → ELIGIBLE
    ['CRL/MP/2025/0012','Ratan Lal Meena',42,'male',0,
     '2025-10-25','[4]',3,2,2,0,1,
     JSON.stringify({surety_bond:false,personal_bond:true,fine_paid:false,id_verified:true}),
     'undertrial',
     'Accused was driving rashly under influence; victim died at scene. No prior criminal record. Family residing in same district. Surety arranged.'],

    // Case 2 – Mohammed Irfan: IPC 420 (7yr max), custody 15 Jan 2023 → ~1408 days > 1278 half-term → ELIGIBLE
    ['CRL/NB/2023/0089','Mohammed Irfan Khan',38,'male',0,
     '2023-01-15','[10]',6,5,4,0,1,
     JSON.stringify({surety_bond:false,personal_bond:false,fine_paid:false,id_verified:true}),
     'undertrial',
     'Accused charged with large-scale cheating in property transactions. Investigation largely complete; charge-sheet filed. No prior convictions. Local family present.'],

    // Case 3 – Suresh Kumar: IPC 307 (10yr max), custody 15 Mar 2026 → ~253 days → 6.9% → RESTRICTED/HIGH RISK
    ['CRL/NB/2026/0245','Suresh Kumar Yadav',29,'male',0,
     '2026-03-15','[5]',8,7,6,1,0,
     JSON.stringify({surety_bond:false,personal_bond:false,fine_paid:false,id_verified:false}),
     'undertrial',
     'Accused fired at victim during land dispute; victim survived with grievous injuries. Prior conviction for assault. Witnesses reside in same village. High flight risk.'],

    // Case 4 – Anita Devi: IPC 498A (3yr max), first-time offender, custody 1 Nov 2025 → ~387 days
    // 1/3 of 3yr = 365 days → 387 > 365 → CONDITIONALLY ELIGIBLE under BNSS 479 first-time offender rule
    ['CRL/NB/2025/0178','Anita Devi Sharma',33,'female',1,
     '2025-11-01','[11]',2,3,2,0,1,
     JSON.stringify({surety_bond:false,personal_bond:false,fine_paid:false,id_verified:true}),
     'undertrial',
     'First-time offender; accused of cruelty to daughter-in-law; complaint filed by victim\'s family. No violence alleged, primarily mental harassment. Two children in accused\'s care.'],

    // Case 5 – Vikram Singh: PMLA §3+§4 (7yr max), custody 20 Jan 2024 → ~1038 days < 1278 half-term
    // PMLA twin conditions apply → RESTRICTED regardless of custody duration
    ['PMLA/ED/2024/0033','Vikram Singh Rathore',51,'male',0,
     '2024-01-20','[41,42]',7,8,9,0,0,
     JSON.stringify({surety_bond:false,personal_bond:false,fine_paid:false,id_verified:true,pp_notice:false,twin_conditions:false}),
     'undertrial',
     'ED case; accused alleged to have laundered ₹47 crore through shell companies. Overseas assets suspected; passport surrendered. PP actively opposing bail. Trial at pre-charge stage.'],
  ]

  const sql = `INSERT INTO cases
    (case_number,prisoner_name,age,gender,is_first_time_offender,
     custody_start_date,charges_json,flight_risk_score,witness_influence_score,
     evidence_tampering_score,prior_convictions,local_ties_verified,
     procedural_checklist_json,status,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

  for (const row of rows) db.run(sql, row)
}

// ─── Initialisation ───────────────────────────────────────────────────────────

async function initDatabase () {
  if (_db) return _db

  const initSqlJs = require('sql.js')

  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql-wasm.wasm')
    : path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm')

  const SQL = await initSqlJs({ locateFile: () => wasmPath })

  _dbPath = path.join(app.getPath('userData'), 'bail_reckoner.sqlite')

  if (fs.existsSync(_dbPath)) {
    const buf = fs.readFileSync(_dbPath)
    _db = new SQL.Database(buf)
    console.log('[DB] Loaded existing database from', _dbPath)
  } else {
    _db = new SQL.Database()
    console.log('[DB] Creating new database at', _dbPath)
  }

  createTables(_db)

  // Seed on first launch
  const seeded = query("SELECT value FROM seed_meta WHERE key='seeded'")
  if (seeded.length === 0) {
    console.log('[DB] Seeding initial data…')
    seedStatutes(_db)
    seedPronouncements(_db)
    seedCases(_db)
    _db.run("INSERT INTO seed_meta (key,value) VALUES ('seeded','true')")
    console.log('[DB] Seeding complete.')
  } else {
    // Ensure BSA 2023 sections exist on pre-existing userData SQLite files
    const bsaCount = query("SELECT COUNT(*) AS n FROM statutes_sections WHERE act_code='BSA_2023'")[0]?.n || 0
    if (bsaCount === 0) {
      const bsaRows = [
        ['BSA_2023','23','Confession to Police Officer & Custody Discovery',
         'Replaces IEA §§25-27. Confession made to a police officer cannot be proved against an accused; only distinct facts discovered in consequence of information from accused in custody are admissible.',
         0,1,0,0,null,'personal_bond',0],
        ['BSA_2023','63','Admissibility of Electronic Records',
         'Replaces IEA §65B. Electronic record is admissible only when accompanied by a statutory certificate signed by the person in charge of the device and an expert.',
         0,1,0,0,'CYBER','personal_bond',0],
        ['BSA_2023','117','Presumption as to Abetment of Suicide by Married Woman',
         'Replaces IEA §113A. Court may presume abetment of suicide by husband or relative where suicide occurs within 7 years of marriage and cruelty is shown.',
         0,0,0,0,'WOMEN_PROTECTION','surety_bond',0],
      ]
      const sql = `INSERT INTO statutes_sections
        (act_code,section_number,title,description,max_punishment_years,
         is_bailable,is_compoundable,is_cognizable,special_category,default_bond_type,typical_fine_inr)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      for (const row of bsaRows) _db.run(sql, row)
      console.log('[DB] Backfilled BSA_2023 statute provisions.')
    }
  }

  saveDatabase()
  return _db
}

// ─── Public query API ─────────────────────────────────────────────────────────

function listStatutes (filter = {}) {
  if (filter.act_code) {
    return query('SELECT * FROM statutes_sections WHERE act_code=? ORDER BY section_number', [filter.act_code])
  }
  return query('SELECT * FROM statutes_sections ORDER BY act_code, section_number')
}

function searchStatutes (searchQuery = '') {
  const q = `%${searchQuery}%`
  return query(
    'SELECT * FROM statutes_sections WHERE title LIKE ? OR description LIKE ? OR section_number LIKE ? ORDER BY act_code',
    [q, q, q]
  )
}

function getStatuteById (id) {
  const rows = query('SELECT * FROM statutes_sections WHERE id=?', [id])
  return rows[0] || null
}

function getStatutesByIds (ids) {
  if (!ids || ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  return query(`SELECT * FROM statutes_sections WHERE id IN (${placeholders})`, ids)
}

function listPronouncements () {
  return query('SELECT * FROM judicial_pronouncements ORDER BY year DESC')
}

function getPronouncement (id) {
  const rows = query('SELECT * FROM judicial_pronouncements WHERE id=?', [id])
  return rows[0] || null
}

function createCase (data) {
  const now = new Date().toISOString()
  const id = run(
    `INSERT INTO cases
      (case_number,prisoner_name,age,gender,is_first_time_offender,
       custody_start_date,charges_json,flight_risk_score,witness_influence_score,
       evidence_tampering_score,prior_convictions,local_ties_verified,
       procedural_checklist_json,status,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.case_number, data.prisoner_name, data.age || null, data.gender || null,
      data.is_first_time_offender ? 1 : 0,
      data.custody_start_date,
      JSON.stringify(data.charges_json || []),
      data.flight_risk_score || 5, data.witness_influence_score || 5,
      data.evidence_tampering_score || 5,
      data.prior_convictions ? 1 : 0, data.local_ties_verified ? 1 : 0,
      JSON.stringify(data.procedural_checklist_json || {}),
      data.status || 'undertrial', data.notes || null, now, now,
    ]
  )
  saveDatabase()
  return getCaseById(id)
}

/** Enrich parsed case row with live bail eligibility & risk summary */
function enrichCase (row) {
  const c = parseCase(row)
  if (!c) return null
  const ids = Array.isArray(c.charges_json) ? c.charges_json : []
  const sections = ids.length ? getStatutesByIds(ids) : []
  const cp = calculateCustodyProgress(c, sections)
  const risk = calculateRiskIndex(c)
  const nature = assessNature(sections)
  const verdict = sections.length ? determineVerdict(c, nature, cp, risk) : null
  const isFirstTime = c.is_first_time_offender === 1 || c.is_first_time_offender === true

  return {
    ...c,
    days_served:        cp?.daysServed ?? 0,
    max_sentence_years: cp?.hasLifeDeath ? -1 : (cp?.maxSentenceYears ?? 0),
    half_term_eligible: !!(cp && !cp.hasLifeDeath && !cp.hasProceduralOnly && cp.halfTermEligible),
    one_third_eligible: !!(isFirstTime && cp && !cp.hasLifeDeath && !cp.hasProceduralOnly && cp.oneThirdEligible),
    half_term_progress: cp?.halfTermProgress ?? 0,
    twin_conditions:    !!nature?.twinConditionsApply,
    verdict_status:     verdict?.status ?? 'PENDING',
    risk_score:         risk.score,
    risk_level:         risk.level,
  }
}

function listCases (filters = {}) {
  let sql = 'SELECT * FROM cases'
  const params = []
  if (filters.status) {
    sql += ' WHERE status=?'
    params.push(filters.status)
  }
  sql += ' ORDER BY created_at DESC'
  return query(sql, params).map(enrichCase)
}

function getCaseById (id) {
  const rows = query('SELECT * FROM cases WHERE id=?', [id])
  return enrichCase(rows[0] || null)
}

function updateCase (id, data) {
  const fields = []
  const params = []

  const updatable = [
    'prisoner_name','age','gender','is_first_time_offender','custody_start_date',
    'flight_risk_score','witness_influence_score','evidence_tampering_score',
    'prior_convictions','local_ties_verified','status','notes',
  ]
  for (const f of updatable) {
    if (data[f] !== undefined) { fields.push(`${f}=?`); params.push(data[f]) }
  }
  if (data.charges_json !== undefined) {
    fields.push('charges_json=?')
    params.push(JSON.stringify(data.charges_json))
  }
  if (data.procedural_checklist_json !== undefined) {
    fields.push('procedural_checklist_json=?')
    params.push(JSON.stringify(data.procedural_checklist_json))
  }

  if (fields.length === 0) return getCaseById(id)

  fields.push('updated_at=?')
  params.push(new Date().toISOString())
  params.push(id)

  run(`UPDATE cases SET ${fields.join(',')} WHERE id=?`, params)
  saveDatabase()
  return getCaseById(id)
}

function deleteCase (id) {
  run('DELETE FROM cases WHERE id=?', [id])
  saveDatabase()
  return { success: true, id }
}

function getDashboardStats () {
  const totalCases     = query('SELECT COUNT(*) AS n FROM cases')[0]?.n || 0
  const undertrial     = query("SELECT COUNT(*) AS n FROM cases WHERE status='undertrial'")[0]?.n || 0
  const totalSections  = query('SELECT COUNT(*) AS n FROM statutes_sections')[0]?.n || 0
  const totalJudgments = query('SELECT COUNT(*) AS n FROM judicial_pronouncements')[0]?.n || 0

  const allCases = listCases()
  let halfTermEligible = 0
  let highRisk         = 0
  let pendingBond      = 0

  for (const c of allCases) {
    if (c.risk_level === 'HIGH') highRisk++
    if (c.status !== 'undertrial') continue

    if (c.half_term_eligible || c.one_third_eligible) {
      halfTermEligible++
    }

    const cl = c.procedural_checklist_json || {}
    if (!cl.surety_bond && !cl.personal_bond) {
      pendingBond++
    }
  }

  return {
    totalCases,
    undertrial,
    totalSections,
    totalJudgments,
    halfTermEligible,
    halfTermAlert: halfTermEligible,
    highRisk,
    pendingBond,
  }
}

module.exports = {
  initDatabase,
  saveDatabase,
  listStatutes,
  searchStatutes,
  getStatuteById,
  getStatutesByIds,
  listPronouncements,
  getPronouncement,
  createCase,
  listCases,
  getCaseById,
  updateCase,
  deleteCase,
  getDashboardStats,
}
