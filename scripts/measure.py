#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Local cl100k_base counts; not Anthropic API counts. Exact legacy baseline unavailable."""
import hashlib,json,pathlib,tiktoken
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/measurements';OUT.mkdir(parents=True,exist_ok=True)
enc=tiktoken.get_encoding('cl100k_base')
def mini(x):return json.dumps(x,separators=(',',':'),ensure_ascii=False)
def size(x):
    s=mini(x);return {'chars':len(s),'utf8_bytes':len(s.encode()),'tokens_cl100k_base':len(enc.encode(s))}
def capture(name):
    data=json.loads((ROOT/'build/measurements'/(name+'.json')).read_text())
    (OUT/(name+'.json')).write_text(mini(data)+'\n');return data

def toolsize(data):
    result=size(data);result['tools']=len(data['tools'])
    result['description_char_share']=sum(len(mini(t.get('description',''))) for t in data['tools'])/result['chars']
    result['schema_char_share']=sum(len(mini(t['inputSchema'])) for t in data['tools'])/result['chars']
    return result
result={'tokenizer':'tiktoken 0.12.0 / cl100k_base; not Anthropic API counts','format':'minified tools/list result, no JSON-RPC envelope or trailing newline',
    'typescript':toolsize(capture('ts-tools-list')),'rea':toolsize(capture('rea-tools-list')),
    'introspect_summary':size(capture('ts-introspect')),'all_operation_details':size(capture('ts-operation-details')),
    'class_summary_full':size(capture('ts-summary-full')),'class_summary_projected':size(capture('ts-summary-projected')),
    'original_baseline':{'tools_approx':25,'chars':None,'tokens':None,'reason':'Exact legacy tools/list capture and baseline unavailable.'},
    'anthropic_count_tokens':None,
    'fixture_sha256':hashlib.sha256((ROOT/'build/fixture/small.apk').read_bytes()).hexdigest()}
result['rea_to_typescript_char_reduction_percent']=100*(1-result['typescript']['chars']/result['rea']['chars'])
result['rea_to_typescript_token_reduction_percent']=100*(1-result['typescript']['tokens_cl100k_base']/result['rea']['tokens_cl100k_base'])
(OUT/'footprint.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
