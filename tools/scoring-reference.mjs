/**
 * Referência determinística de domínio para o contrato 1.0.0.
 * Não implementa HTTP, autenticação, persistência ou interpretação por IA.
 * Valores de entrada já normalizados e validados conforme OpenAPI.
 */
const clamp = value => Math.max(0, Math.min(100, value));
// Domain products have four decimals. Quantize before half-up presentation rounding.
const round = value => Math.round(Math.round(value * 10000) / 100) / 100;
const precise = value => Math.round(value * 10000) / 10000;
const product = (a,b) => Math.round(a*100)*Math.round(b*100)/10000;
const unknown = value => value === null || value === undefined;
const both = (a,b) => a === false || b === false ? 0 : a === true && b === true ? 1 : null;
const boolFactor = value => unknown(value) ? null : value ? 1 : 0;
const numericFactor = (value, rule) => unknown(value) ? null : rule(value) ? 1 : 0;
const levelFactor = (value,rules) => unknown(value) ? null : ({low:0,medium:rules.shared.medium_factor,high:1})[value];
const day = date => Date.parse(date + 'T00:00:00Z') / 86400000;
const live = record => !record.archived_at;
function validateRules(r) {
  for (const group of ['icp','priority']) {
    const values=Object.values(r[group].weights);
    if (values.some(v => !Number.isFinite(v) || v < 0 || v > 100) || Math.abs(values.reduce((a,b)=>a+b,0)-100)>1e-8) throw new Error('RULE_WEIGHTS_MUST_SUM_100');
  }
  if(r.shared.employee_min>r.shared.employee_max) throw new Error('INVALID_EMPLOYEE_RANGE');
  if(r.priority.medium_threshold>=r.priority.high_threshold) throw new Error('INVALID_BAND_THRESHOLDS');
  if(r.disqualifiers.D03.professional_public_only!==true) throw new Error('D03_CANNOT_BE_DISABLED');
}
function criterion(id,factor,weight,fields=[],ids=[]) {
  return {id,factor,weight,points:round(product(weight,(factor??0))),missing:factor===null,reason_code:factor===null?'UNKNOWN':factor===1?'MATCH':factor===0?'NO_MATCH':'PARTIAL_MATCH',input_fields:fields,evidence_ids:ids};
}
function derive(company,signals,contacts,history,rules,asOf) {
  const recent=signals.filter(s=>live(s)&&s.company_id===company.id&&s.source_allowed===true&&s.strength==='high'&&s.observed_on&&day(s.observed_on)<=day(asOf)&&day(asOf)-day(s.observed_on)<=rules.priority.recent_signal_days);
  const decisionMakers=contacts.filter(c=>live(c)&&c.company_id===company.id&&c.source_allowed===true&&c.is_professional_public===true&&c.decision_maker_identified===true&&c.full_name?.trim()&&c.job_title?.trim()&&c.channel_value?.trim());
  // Casos sem data ou segmento no fechamento não viram aprendizado histórico.
  const dated=history.filter(h=>live(h)&&h.company_id!==company.id&&h.closed_on&&day(h.closed_on)<=day(asOf)&&h.segment_at_close&&h.segment_at_close===company.segment&&['won','lost'].includes(h.result));
  const won=dated.filter(h=>h.result==='won');
  return {recent:recent.length?1:0,decisionMaker:decisionMakers.length?1:0,history:unknown(company.segment)||!dated.length?null:won.length?1:0,recentIds:recent.map(s=>s.id),contactIds:decisionMakers.map(c=>c.id),historyIds:won.map(h=>h.id)};
}
export function evaluate({company,signals=[],contacts=[],opportunities=[],rules,as_of,review_completed=false,pending_suggestions=0}) {
  validateRules(rules);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(as_of)||!Number.isFinite(day(as_of))) throw new Error('INVALID_AS_OF');
  const f={
    size:numericFactor(company.employees,n=>n>=rules.shared.employee_min&&n<=rules.shared.employee_max),
    hr:boolFactor(company.hr_structured), benefits:both(company.has_benefits,company.seeks_benefit_differentiation),
    growth:levelFactor(company.growth,rules),employer_branding:levelFactor(company.employer_branding,rules),
    geography:boolFactor(company.multi_region),region:unknown(company.uf)?null:rules.shared.priority_ufs.includes(company.uf)?1:rules.shared.other_region_factor,
    retention:levelFactor(company.retention_pain,rules),renewal:unknown(company.renewal_window)?null:rules.shared.accepted_renewal_windows.includes(company.renewal_window)?1:0,
  };
  const fields={size:['employees'],hr:['hr_structured'],benefits:['has_benefits','seeks_benefit_differentiation'],growth:['growth'],employer_branding:['employer_branding'],geography:['multi_region'],region:['uf'],retention:['retention_pain'],renewal:['renewal_window']};
  const criteria=Object.entries(rules.icp.weights).map(([k,w])=>criterion(k,f[k],w,fields[k]));
  const lower=precise(criteria.reduce((sum,c)=>sum+product(c.weight,(c.factor??0)),0));
  const upper=precise(lower+criteria.filter(c=>c.missing).reduce((sum,c)=>sum+c.weight,0));
  const failures=[],requirements=[];
  const gateCheck=(id,enabled,value,pass)=>{
    if(!enabled)return;
    if(unknown(value))requirements.push(id);else if(!pass(value))failures.push(id);
  };
  gateCheck('D01',rules.disqualifiers.D01.enabled,company.employees,v=>v>=rules.disqualifiers.D01.min_employees);
  gateCheck('D02',rules.disqualifiers.D02.enabled,company.operates_in_brazil,v=>v===true);
  gateCheck('D04',rules.disqualifiers.D04.enabled,company.operating_status==='unknown'?null:company.operating_status,v=>v==='active');
  for(const id of rules.icp.required_criteria) {
    if(unknown(f[id]))requirements.push('required:'+id);else if(f[id]!==1)failures.push('required:'+id);
  }
  let state;
  if(company.archived_at) {state='out';failures.push('ARCHIVED');}
  else if(failures.length||upper<rules.icp.threshold)state='out';
  else if(requirements.length||lower<rules.icp.threshold)state='pending';
  else state='in';
  const gate={state,in_icp:state==='pending'?null:state==='in',score_min:round(lower),score_max:round(upper),threshold:rules.icp.threshold,hard_failures:failures,unknown_requirements:requirements,criteria};
  if(state!=='in')return {gate,priority:null};
  const d=derive(company,signals,contacts,opportunities,rules,as_of);
  const pf={S01:f.size,S02:f.hr,S03:f.geography,S04:f.growth,S05:f.employer_branding,S06:f.retention,S07:f.renewal,S08:d.recent,S09:d.decisionMaker,S10:d.history};
  const pfields={S01:fields.size,S02:fields.hr,S03:fields.geography,S04:fields.growth,S05:fields.employer_branding,S06:fields.retention,S07:fields.renewal,S08:['signals'],S09:['contacts'],S10:['opportunities']};
  const ids={S08:d.recentIds,S09:d.contactIds,S10:d.historyIds};
  const pcriteria=Object.entries(rules.priority.weights).map(([k,w])=>criterion(k,pf[k],w,pfields[k],ids[k]||[]));
  const known=precise(pcriteria.reduce((sum,c)=>sum+product(c.weight,(c.factor??0)),0));
  const missing=precise(pcriteria.filter(c=>c.missing).reduce((sum,c)=>sum+c.weight,0));
  const applied=rules.disqualifiers.D05.enabled&&company.renewed_24_plus===true?rules.disqualifiers.D05.penalty_points:0;
  const possible=rules.disqualifiers.D05.enabled&&unknown(company.renewed_24_plus)?rules.disqualifiers.D05.penalty_points:0;
  const raw=clamp(known-applied);
  const score=round(raw);
  const warnings=[];
  if(missing)warnings.push('MISSING_PRIORITY_INPUTS');
  if(possible)warnings.push('D05_UNKNOWN_NOT_APPLIED');
  if(!review_completed)warnings.push('HUMAN_REVIEW_NOT_COMPLETED');
  if(pending_suggestions)warnings.push('PENDING_SUGGESTIONS');
  const band=raw>=rules.priority.high_threshold?'high':raw>=rules.priority.medium_threshold?'medium':'low';
  return {gate,priority:{score,score_min:round(clamp(known-applied-possible)),score_max:round(clamp(known+missing-applied)),band,status:warnings.length?'preliminary':'reviewed',criteria:pcriteria,applied_penalty:applied,possible_penalty:possible,known_weight:round(100-missing),warnings}};
}
export function rankRows(rows) {
  const raw = row => clamp(precise(row.assessment.priority.criteria.reduce((sum,c)=>sum+product(c.weight,c.factor??0),0))-row.assessment.priority.applied_penalty);
  return rows.filter(r=>r.assessment.gate.state==='in').sort((a,b)=>
    raw(b)-raw(a)||
    b.assessment.priority.known_weight-a.assessment.priority.known_weight||
    (a.external_id<b.external_id?-1:a.external_id>b.external_id?1:0)
  ).map((r,i)=>({...r,rank:i+1}));
}
