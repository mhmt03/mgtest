using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using mgtest.Models;

namespace mgtest.Controllers
{
    public class HomeController : Controller
    {
        public IActionResult Index()
        {
            // Her zaman login sayfasına yönlendir
            return RedirectToAction("Login", "Account");
        }

        public IActionResult LocalDbTest()
        {
            return View();
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
