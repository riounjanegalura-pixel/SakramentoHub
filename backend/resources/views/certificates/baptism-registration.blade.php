<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $title }} {{ $reference }}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; margin: 0; padding: 20px; font-size: 14px; }
  .sheet { max-width: 780px; margin: 0 auto; }
  .head { text-align: center; margin-bottom: 14px; }
  .head img { height: 64px; }
  .head .diocese { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; margin: 6px 0 0; }
  .head .parish { font-size: 17px; font-weight: bold; margin: 2px 0; font-variant: small-caps; }
  .head .addr { font-size: 11px; color: #555; margin: 0; }
  h1 { font-size: 20px; text-align: center; margin: 12px 0 0; letter-spacing: 1px; text-transform: uppercase; }
  .sub { text-align: center; font-style: italic; color: #555; margin: 0 0 12px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .5px; margin: 18px 0 6px; border-bottom: 2px solid #1a1a1a; padding-bottom: 2px; }
  h2 em { font-weight: normal; text-transform: none; color: #555; }
  .row { display: flex; gap: 14px; margin-bottom: 8px; }
  .f { flex: 1; min-width: 0; }
  .f .v { border-bottom: 1px solid #333; min-height: 20px; padding: 1px 2px; font-weight: bold; word-break: break-word; }
  .f .l { font-size: 10.5px; color: #444; text-align: center; margin-top: 1px; }
  .f .l i { color: #777; display: block; }
  .w2 { flex: 2; } .w3 { flex: 3; } .w05 { flex: .5; }
  .checks { margin: 6px 0; }
  .checks span { display: inline-block; margin-right: 18px; }
  .box { display: inline-block; width: 12px; height: 12px; border: 1px solid #333; vertical-align: -2px; margin-right: 5px; text-align: center; line-height: 11px; font-size: 11px; }
  .sp { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .sp td, .sp th { border-bottom: 1px solid #aaa; padding: 3px 4px; text-align: left; font-size: 13px; }
  .sp th { font-size: 10.5px; color: #444; font-weight: normal; border-bottom: 1px solid #333; }
  .omit { font-style: italic; color: #555; }
  .signature { margin: 28px 0 0 auto; width: 100%; max-width: 280px; text-align: center; }
  .signature p { margin: 2px 0; }
  .sig-image { display: block; max-width: 100%; max-height: 70px; margin: 0 auto -6px; }
  .sig-line { border-top: 1px solid #333; margin: 0 0 4px; height: 0; }
  .sig-name { font-weight: bold; }
  .signature .sig-date { margin-top: 6px; font-size: 12px; color: #444; }
  .print { margin: 18px auto 0; display: block; padding: 8px 22px; font-size: 14px; cursor: pointer; }
  .signature { break-inside: avoid; }
  @media print {
    .print { display: none; }
    body { padding: 0; font-size: 13px; }
    /* The page margin lives on the sheet so the browser's date/URL header and footer have no room to print. */
    .sheet { padding: 9mm 12mm; zoom: 0.93; } /* a full form with several godparents still fits one A4 page */
    .head { margin-bottom: 6px; }
    .head img { height: 58px; width: auto; }
    h1 { margin: 6px 0 0; font-size: 18px; }
    .sub { margin: 0 0 6px; }
    h2 { margin: 10px 0 3px; }
    .row { margin-bottom: 4px; }
    .f .v { min-height: 17px; }
    .sp td, .sp th { padding: 2px 4px; }
    .signature { margin-top: 10px; }
    .sheet > p.l { margin-top: 8px !important; }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    @if($crest)<img src="{{ $crest }}" alt="">@endif
    <p class="diocese">Diocese of Malolos</p>
    <p class="parish">{{ $parishName }}</p>
    @if($parishAddress)<p class="addr">{{ $parishAddress }}</p>@endif
  </div>
  <h1>{{ $title }}</h1>
  <p class="sub">{{ $subtitle }}</p>

  <h2>Person to be baptized <em>(Bibinyagan)</em></h2>
  <div class="row">
    <div class="f w2"><div class="v">{{ $child['first'] }}</div><div class="l">First Name<i>Pangalan</i></div></div>
    <div class="f w2"><div class="v">{{ $child['middle'] }}</div><div class="l">Middle Name<i>Gitnang Pangalan</i></div></div>
    <div class="f w2"><div class="v">{{ $child['last'] }}</div><div class="l">Surname<i>Apelyido</i></div></div>
    <div class="f w05"><div class="v">{{ $child['suffix'] }}</div><div class="l">Suffix<i>(Jr., I, II)</i></div></div>
  </div>
  <div class="row">
    <div class="f w2"><div class="v">{{ $child['birth'] }}</div><div class="l">Date of Birth<i>Petsa ng Kapanganakan</i></div></div>
    <div class="f w05"><div class="v">{{ $child['age'] }}</div><div class="l">Age<i>Edad</i></div></div>
    <div class="f"><div class="v">{{ $child['sex'] }}</div><div class="l">Gender<i>Kasarian</i></div></div>
    <div class="f w2"><div class="v">{{ $child['place'] }}</div><div class="l">Place of Birth<i>Lugar ng Kapanganakan</i></div></div>
  </div>

  <h2>Parents information <em>(Impormasyon ng Magulang)</em></h2>
  @if($father)
    <div class="row">
      <div class="f w2"><div class="v">{{ $father['first'] }}</div><div class="l">Father's First Name<i>Pangalan ng Ama</i></div></div>
      <div class="f w2"><div class="v">{{ $father['middle'] }}</div><div class="l">Middle Name<i>Gitnang Pangalan</i></div></div>
      <div class="f w2"><div class="v">{{ $father['last'] }}</div><div class="l">Surname<i>Apelyido</i></div></div>
      <div class="f w05"><div class="v">{{ $father['suffix'] }}</div><div class="l">Suffix</div></div>
    </div>
    <div class="row">
      <div class="f"><div class="v">{{ $father['place'] }}</div><div class="l">Place of Birth<i>Lugar ng Kapanganakan</i></div></div>
      <div class="f w2"><div class="v">{{ $father['address'] }}</div><div class="l">Current Address (Town/City/Province)<i>Kasalukuyang Tirahan</i></div></div>
    </div>
  @else
    <p class="omit">Father's details left out: {{ $fatherOmitted }}</p>
  @endif
  @if($mother)
    <div class="row">
      <div class="f w2"><div class="v">{{ $mother['first'] }}</div><div class="l">Mother's First Name<i>Pangalan ng Ina</i></div></div>
      <div class="f w2"><div class="v">{{ $mother['middle'] }}</div><div class="l">Maiden Middle Name<i>Gitnang Pangalan sa Pagkadalaga</i></div></div>
      <div class="f w2"><div class="v">{{ $mother['last'] }}</div><div class="l">Maiden Surname<i>Apelyido ng Ina sa Pagkadalaga</i></div></div>
    </div>
    <div class="row">
      <div class="f"><div class="v">{{ $mother['place'] }}</div><div class="l">Place of Birth<i>Lugar ng Kapanganakan</i></div></div>
      <div class="f w2"><div class="v">{{ $mother['address'] }}</div><div class="l">Current Address (Town/City/Province)<i>Kasalukuyang Tirahan</i></div></div>
    </div>
  @else
    <p class="omit">Mother's details left out: {{ $motherOmitted }}</p>
  @endif

  <div class="checks">
    <span><i class="box">{{ $marriageKind === 'catholic' ? '✓' : '' }}</i>Catholic Wedding <small>(Kasal sa Simbahan)</small></span>
    <span><i class="box"></i>Mixed Marriage / Disparity of Cult</span>
    <span><i class="box">{{ $marriageKind === 'civil' ? '✓' : '' }}</i>Civil Wedding <small>(Kasal sa Sibil)</small></span>
    <span><i class="box">{{ $marriageKind === 'not_married' ? '✓' : '' }}</i>Not Married <small>(Hindi Kasal)</small></span>
  </div>
  <div class="row">
    <div class="f"><div class="v">{{ $marriagePlace }}</div><div class="l">Place of Marriage<i>Lugar ng Kasal</i></div></div>
    <div class="f"><div class="v">{{ $marriageDate }}</div><div class="l">Date of Marriage<i>Petsa ng Kasal</i></div></div>
  </div>

  <h2>Other information <em>(Iba pang Impormasyon)</em></h2>
  <div class="row">
    <div class="f w2"><div class="v">{{ $minister }}</div><div class="l">Minister of Baptism<i>Nagbinyag</i></div></div>
    <div class="f"><div class="v">{{ $baptismDate }}</div><div class="l">Date of Baptism<i>Petsa ng Binyag</i></div></div>
    <div class="f"><div class="v">{{ $baptismTime }}</div><div class="l">Time of Baptism<i>Oras ng Binyag</i></div></div>
  </div>
  <div class="row">
    <div class="f"><div class="v">{{ $principalNinong['name'] ?? '' }}</div><div class="l">Principal Ninong <i>Pangunahing Ninong (dapat edad 18 pataas)</i></div></div>
    <div class="f w05"><div class="v">{{ $principalNinong['age'] ?? '' }}</div><div class="l">Age / Edad</div></div>
    <div class="f"><div class="v">{{ $principalNinong['place'] ?? '' }}</div><div class="l">Town / Tirahan</div></div>
    <div class="f"><div class="v">{{ $principalNinang['name'] ?? '' }}</div><div class="l">Principal Ninang <i>Pangunahing Ninang (dapat edad 18 pataas)</i></div></div>
    <div class="f w05"><div class="v">{{ $principalNinang['age'] ?? '' }}</div><div class="l">Age / Edad</div></div>
    <div class="f"><div class="v">{{ $principalNinang['place'] ?? '' }}</div><div class="l">Town / Tirahan</div></div>
  </div>
  @if(count($otherSponsors))
    <table class="sp">
      <tr><th>Other Ninong / Ninang <i>(Iba pang Ninong / Ninang)</i></th><th>Age / Edad</th><th>Religion / Relihiyon</th></tr>
      @foreach($otherSponsors as $s)
        <tr><td>{{ $s['name'] }}</td><td>{{ $s['age'] }}</td><td>{{ $s['religion'] }}</td></tr>
      @endforeach
    </table>
  @endif

  <h2>For the parish office</h2>
  <div class="row">
    <div class="f"><div class="v">{{ $accomplishedBy }}</div><div class="l">Accomplished by<i>Nagtala</i></div></div>
    <div class="f"><div class="v">{{ $relation }}</div><div class="l">Relation to Baptized<i>Kaugnayan sa Bibinyagan</i></div></div>
  </div>
  <div class="row">
    <div class="f"><div class="v">{{ $contact }}</div><div class="l">Contact Number<i>Numero</i></div></div>
    <div class="f"><div class="v">{{ $accomplishedOn }}</div><div class="l">Date Accomplished<i>Petsa ng Pagpapatala</i></div></div>
  </div>
  <div class="row">
    <div class="f"><div class="v"></div><div class="l">Donation / AR Number<i>Donasyon</i></div></div>
    <div class="f"><div class="v"></div><div class="l">Birth Certificate Registry No.</div></div>
  </div>
  <div class="row">
    <div class="f"><div class="v">{{ $register['book'] }}</div><div class="l">Baptism Book No.</div></div>
    <div class="f"><div class="v">{{ $register['page'] }}</div><div class="l">Page</div></div>
    <div class="f"><div class="v">{{ $register['line'] }}</div><div class="l">Line</div></div>
    <div class="f w2"><div class="v"></div><div class="l">Noted by<i>Tumanggap ng Pagpapatala</i></div></div>
  </div>
  @include('certificates.partials.signature', ['issuedOn' => $preparedOn])
  <p class="l" style="font-size:11px;color:#666;margin-top:14px">Booking {{ $reference }} · prepared {{ $preparedOn }}</p>
</div>
<button class="print" onclick="window.print()">Print</button>
</body>
</html>
