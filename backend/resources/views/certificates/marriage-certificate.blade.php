<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $title }} {{ $reference }}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 20px; font-size: 13px; }
  .sheet { max-width: 800px; margin: 0 auto; }
  .head { text-align: center; margin-bottom: 8px; }
  .head img { height: 60px; }
  .head .parish { font-size: 15px; font-weight: bold; margin: 4px 0 0; }
  .head .addr { font-size: 11px; color: #555; margin: 0; }
  h1 { font-size: 20px; text-align: center; margin: 8px 0 12px; letter-spacing: 1px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; }
  .grid th, .grid td { border: 1px solid #9a3a62; padding: 5px 7px; vertical-align: top; text-align: left; }
  .grid thead th { text-align: center; background: #faf2f6; }
  .grid td.n { width: 22%; font-size: 11.5px; color: #333; }
  .grid td.v { font-weight: bold; text-transform: uppercase; word-break: break-word; }
  .lbl { display: block; font-size: 9.5px; font-weight: normal; color: #9a3a62; text-transform: none; }
  h2 { font-size: 13px; text-transform: uppercase; margin: 16px 0 6px; }
  .cert { border: 1px solid #9a3a62; padding: 8px 10px; line-height: 1.7; }
  .u { display: inline-block; min-width: 110px; border-bottom: 1px solid #333; font-weight: bold; text-transform: uppercase; padding: 0 3px; }
  .sig { display: flex; gap: 30px; margin-top: 26px; }
  .sig div { flex: 1; border-top: 1px solid #333; text-align: center; font-size: 11px; padding-top: 3px; }
  .print { margin: 18px auto 0; display: block; padding: 8px 22px; font-size: 14px; cursor: pointer; }
  @media print { .print { display: none; } body { padding: 0; } }
</style>
</head>
<body>
@php
  $name = fn ($p) => collect([$p['first'], $p['middle'], $p['last'], $p['suffix'] ?? null])->filter()->implode(' ');
  $both = fn ($key) => [$groom[$key], $bride[$key]];
  $join = fn ($parts) => collect($parts)->filter()->implode(' ');
@endphp
<div class="sheet">
  <div class="head">
    @if($crest)<img src="{{ $crest }}" alt="">@endif
    <p class="parish">{{ $parishName }}</p>
    @if($parishAddress)<p class="addr">{{ $parishAddress }}</p>@endif
  </div>
  <h1>{{ $title }}</h1>

  <table class="grid">
    <thead><tr><th></th><th>Husband</th><th>Wife</th></tr></thead>
    <tbody>
      <tr><td class="n">1. Name of contracting parties</td><td class="v">{{ $name($groom) }}</td><td class="v">{{ $name($bride) }}</td></tr>
      <tr><td class="n">2a. Date of birth<br>2b. Age</td><td class="v">{{ $groom['birth'] }}<span class="lbl">Age: {{ $groom['age'] }}</span></td><td class="v">{{ $bride['birth'] }}<span class="lbl">Age: {{ $bride['age'] }}</span></td></tr>
      <tr><td class="n">3. Place of birth</td><td class="v">{{ $groom['place'] }}</td><td class="v">{{ $bride['place'] }}</td></tr>
      <tr><td class="n">4a. Sex<br>4b. Citizenship</td><td class="v">{{ $groom['sex'] }}<span class="lbl">{{ $groom['citizenship'] }}</span></td><td class="v">{{ $bride['sex'] }}<span class="lbl">{{ $bride['citizenship'] }}</span></td></tr>
      <tr><td class="n">5. Residence</td><td class="v">{{ $groom['residence'] }}</td><td class="v">{{ $bride['residence'] }}</td></tr>
      <tr><td class="n">6. Religion / religious sect</td><td class="v">{{ $groom['religion'] }}</td><td class="v">{{ $bride['religion'] }}</td></tr>
      <tr><td class="n">7. Civil status</td><td class="v">{{ $groom['status'] }}</td><td class="v">{{ $bride['status'] }}</td></tr>
      <tr><td class="n">8. Name of father</td><td class="v">{{ $join($groom['father']) }}</td><td class="v">{{ $join($bride['father']) }}</td></tr>
      <tr><td class="n">9. Citizenship</td><td class="v">{{ $groom['fatherCitizenship'] }}</td><td class="v">{{ $bride['fatherCitizenship'] }}</td></tr>
      <tr><td class="n">10. Maiden name of mother</td><td class="v">{{ $join($groom['mother']) }}</td><td class="v">{{ $join($bride['mother']) }}</td></tr>
      <tr><td class="n">11. Citizenship</td><td class="v">{{ $groom['motherCitizenship'] }}</td><td class="v">{{ $bride['motherCitizenship'] }}</td></tr>
      <tr><td class="n">12-14. Person who gave consent or advice (name, relationship, residence)</td><td class="v">&nbsp;</td><td class="v">&nbsp;</td></tr>
    </tbody>
  </table>

  <table class="grid" style="margin-top:-1px">
    <tr><td class="n">15. Place of marriage</td><td class="v" colspan="3">{{ $place }}</td></tr>
    <tr><td class="n">16. Date of marriage</td><td class="v">{{ $marriageDate }}</td><td class="n">17. Time of marriage</td><td class="v">{{ $marriageTime }}</td></tr>
  </table>

  <h2>19. Certification of the solemnizing officer</h2>
  <div class="cert">
    This is to certify that before me, on the date and place above written, personally appeared the above-mentioned parties,
    with their mutual consent, lawfully joined together in marriage, which was solemnized by me in the presence of the witnesses named below, all of legal age.
    <br>Marriage License No. <span class="u">&nbsp;</span> issued on <span class="u">&nbsp;</span> at <span class="u">&nbsp;</span>
    <br>Solemnizing officer: <span class="u">{{ $minister }}</span> &nbsp; Position: <span class="u">Parish Priest</span>
  </div>

  <h2>20. Witnesses <small style="text-transform:none;font-weight:normal">(principal sponsors named in the booking)</small></h2>
  <div class="cert">
    @forelse($witnesses as $w)
      {{ $loop->iteration }}. <span class="u">{{ $w }}</span>&nbsp;&nbsp;
    @empty
      <span class="u">&nbsp;</span>
    @endforelse
  </div>

  <div class="sig">
    <div>Signature of Husband</div>
    <div>Signature of Wife</div>
    <div>Signature of Solemnizing Officer</div>
  </div>

  <table class="grid" style="margin-top:18px">
    <tr><td class="n">Register</td><td class="v">{{ $register['number'] }}</td><td class="n">Book / Page / Line</td><td class="v">{{ collect([$register['book'], $register['page'], $register['line']])->filter()->implode(' / ') }}</td></tr>
  </table>
  <p style="font-size:11px;color:#666;margin-top:12px">Booking {{ $reference }} · prepared {{ $preparedOn }}</p>
</div>
<button class="print" onclick="window.print()">Print</button>
</body>
</html>
