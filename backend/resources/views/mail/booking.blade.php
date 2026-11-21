<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $subjectLine }}</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:Georgia,'Times New Roman',serif;color:#2b2b2b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:24px 12px;">
    <tr>
        <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;padding:28px;">
                <tr>
                    <td style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#6b6b6b;padding-bottom:16px;">{{ $parishName }}</td>
                </tr>
                <tr>
                    <td style="font-size:16px;line-height:1.55;">
                        <p style="margin:0 0 14px;">Hello {{ $greetingName }},</p>
                        @foreach ($lines as $line)
                            <p style="margin:0 0 14px;">{{ $line }}</p>
                        @endforeach
                        @if ($actionUrl && $actionLabel)
                            <p style="margin:22px 0;">
                                <a href="{{ $actionUrl }}" style="display:inline-block;background:#3d2f6b;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-family:Arial,sans-serif;font-size:15px;">{{ $actionLabel }}</a>
                            </p>
                        @endif
                    </td>
                </tr>
                <tr>
                    <td style="font-size:12px;color:#8a8a8a;padding-top:18px;border-top:1px solid #eeeeee;">
                        You are receiving this because of a request you made with {{ $parishName }}. Please do not reply to this email.
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
