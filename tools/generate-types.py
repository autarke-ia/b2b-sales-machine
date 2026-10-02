"""Generate transport types from the shipped OpenAPI JSON (Python standard library)."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
o=json.loads((ROOT/'contracts/openapi.json').read_text(encoding='utf-8'))
def render(s):
    if '$ref' in s:return s['$ref'].rsplit('/',1)[1]
    if 'const' in s:return json.dumps(s['const'],ensure_ascii=False)
    if 'enum' in s:return ' | '.join(json.dumps(x,ensure_ascii=False) for x in s['enum'])
    if 'anyOf' in s:return ' | '.join(render(x) for x in s['anyOf'])
    if 'oneOf' in s:return ' | '.join(render(x) for x in s['oneOf'])
    t=s.get('type')
    if isinstance(t,list):return ' | '.join(render({'type':x}) for x in t)
    if t=='array':return 'Array<'+render(s['items'])+'>'
    if t=='object':
        props=s.get('properties',{});required=s.get('required',[])
        parts=[json.dumps(k)+('' if k in required else '?')+': '+render(v)+';' for k,v in props.items()]
        if s.get('additionalProperties') is True:parts.append('[key: string]: unknown;')
        return '{ '+ ' '.join(parts)+' }'
    return {'string':'string','integer':'number','number':'number','boolean':'boolean','null':'null'}.get(t,'unknown')
parts=['// GENERATED from openapi.json. Do not edit by hand.','// Conditional field rules, formats and numerical constraints are validated at runtime.']
for name,s in o['components']['schemas'].items():parts.append('export type '+name+' = '+render(s)+';')
(ROOT/'contracts/api-types.generated.ts').write_text('\n\n'.join(parts)+'\n',encoding='utf-8')
print('Generated',len(o['components']['schemas']),'transport types')
