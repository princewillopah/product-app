#!/usr/bin/env python3
"""End-to-end observability verification: metrics (Prometheus), logs (Loki),
traces (Tempo). Assumes port-forwards on the ports below."""
import json
import sys
import urllib.parse
import urllib.request

PROM = "http://localhost:19090"
LOKI = "http://localhost:19100"
TEMPO = "http://localhost:19200"


def get(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.load(r)


def prom_query(expr):
    q = urllib.parse.urlencode({"query": expr})
    return get(f"{PROM}/api/v1/query?{q}")


def main():
    print("=" * 60)
    print("METRICS (Prometheus)")
    print("=" * 60)
    up = prom_query('up{namespace="product-app"}')
    rows = up["data"]["result"]
    if not rows:
        print("  NO product-app targets discovered yet")
    for r in sorted(rows, key=lambda x: x["metric"].get("job", "")):
        m = r["metric"]
        job = m.get("job", "?")
        pod = m.get("pod_name") or m.get("pod", "?")
        print(f"  up  job={job:18s} pod={pod:34s} = {r['value'][1]}")

    total = prom_query("sum(http_requests_total)")["data"]["result"]
    print(f"\n  sum(http_requests_total) = {total[0]['value'][1] if total else 'NONE'}")

    byjob = prom_query("sum by (job) (http_requests_total)")["data"]["result"]
    for r in sorted(byjob, key=lambda x: x["metric"].get("job", "")):
        print(f"    {r['metric'].get('job','?'):18s} {r['value'][1]}")

    sg = prom_query("count(traces_service_graph_request_total)")["data"]["result"]
    print(f"\n  Tempo service-graph series in Prom = {sg[0]['value'][1] if sg else '0'}")
    sm = prom_query("count(traces_spanmetrics_calls_total)")["data"]["result"]
    print(f"  Tempo span-metrics series in Prom  = {sm[0]['value'][1] if sm else '0'}")

    print("\n" + "=" * 60)
    print("LOGS (Loki)")
    print("=" * 60)
    try:
        labels = get(f"{LOKI}/loki/api/v1/labels")
        print(f"  available labels: {labels['data'][:12]}")
        # how many streams mention product-app namespace?
        q = urllib.parse.urlencode({
            "query": '{k8s_namespace_name="product-app"}',
            "limit": "5",
        })
        res = get(f"{LOKI}/loki/api/v1/query_range?{q}")
        streams = res["data"]["result"]
        print(f"  streams for k8s_namespace_name=product-app: {len(streams)}")
        for s in streams[:3]:
            lbls = s.get("stream", {})
            name = lbls.get("k8s_pod_name") or lbls.get("pod") or "?"
            print(f"    sample stream pod={name} entries={len(s.get('values', []))}")
    except Exception as e:
        print(f"  Loki query error: {e}")

    print("\n" + "=" * 60)
    print("TRACES (Tempo)")
    print("=" * 60)
    try:
        tags = get(f"{TEMPO}/api/search/tag/service.name/values")
        vals = tags.get("tagValues", [])
        print(f"  service.name values seen in Tempo: {vals}")
        res = get(f"{TEMPO}/api/search?tags=&limit=5")
        traces = res.get("traces", [])
        print(f"  recent traces returned: {len(traces)}")
        for t in traces[:3]:
            print(f"    traceID={t.get('traceID','?')[:16]} root={t.get('rootServiceName','?')}/{t.get('rootTraceName','?')}")
    except Exception as e:
        print(f"  Tempo query error: {e}")


if __name__ == "__main__":
    main()
